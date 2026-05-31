# Discord System Architecture & Scaling Rules
> Tài liệu kiến trúc hệ thống Discord-like — tech stack thực tế, design decisions, và các quy tắc bắt buộc khi xây dựng để scale lên hàng triệu concurrent users.

---

## 1. TỔNG QUAN HỆ THỐNG

### 1.1 Scale thực tế của Discord (2025–2026)

| Metric | Giá trị |
|---|---|
| Monthly Active Users | ~200 triệu |
| Concurrent Connections | 12+ triệu (peak) |
| Messages / ngày | 1+ tỷ |
| WebSocket Events / giây | 26 triệu |
| Guilds (Servers) | Hàng triệu |
| Elixir machines (chat infra) | 400–500 nodes |
| ScyllaDB nodes (messages) | 72 nodes (giảm từ 177 Cassandra nodes) |
| Dữ liệu messages | Hàng nghìn tỷ messages |

### 1.2 Polyglot Architecture — "Đúng ngôn ngữ cho đúng vấn đề"

```
┌─────────────────────────────────────────────────────────┐
│                   LANGUAGE MAP                          │
├──────────────┬──────────────────────────────────────────┤
│ Elixir/BEAM  │ Gateway, Presence, Pub/Sub, Push notif   │
│ Python       │ REST API monolith, business logic        │
│ Rust         │ Read States, Data Services, Media Proxy  │
│ C++          │ Voice SFU, client audio engine           │
│ TypeScript   │ Web client (React), tooling              │
│ Go           │ Một số internal tools (đã migrate → Rust)│
└──────────────┴──────────────────────────────────────────┘
```

**Triết lý**: Không có ngôn ngữ tốt nhất — chọn theo yêu cầu latency, throughput, và concurrency của từng component.

---

## 2. KIẾN TRÚC TỔNG THỂ (LAYERED)

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│   Web (React/TS)  │  Desktop (Electron+C++)  │  Mobile (C++)│
└────────────┬──────────────────┬──────────────────┬──────────┘
             │ WebSocket        │ REST/HTTP         │ WebRTC
             ▼                  ▼                   ▼
┌─────────────────────┐  ┌──────────────┐  ┌───────────────────┐
│    GATEWAY LAYER     │  │  API LAYER   │  │   VOICE LAYER     │
│  (Elixir/BEAM)       │  │  (Python)    │  │  (C++ SFU)        │
│  - WebSocket mgmt    │  │  - REST CRUD │  │  - DAVE E2EE      │
│  - Event dispatch    │  │  - Auth/OAuth│  │  - Opus codec     │
│  - Guild pub/sub     │  │  - Rate limit│  │  - Regional nodes │
│  - Presence          │  │  - Webhooks  │  │                   │
└─────────┬───────────┘  └──────┬───────┘  └────────┬──────────┘
          │                     │                    │
          ▼                     ▼                    │
┌─────────────────────────────────────────┐          │
│           SERVICE LAYER                  │          │
│  Read States (Rust)  │  Data Svc (Rust) │          │
│  Media Proxy (Rust)  │  Search (ES)     │          │
└─────────────────────┬───────────────────┘          │
                      ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        DATA LAYER                            │
│  ScyllaDB (Messages) │ PostgreSQL (Users/Guilds) │ Redis    │
│  Elasticsearch (Search) │ Cassandra (Read States) │ GCS/CDN │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. GATEWAY LAYER — ELIXIR/BEAM

### 3.1 Tại sao Elixir?

Elixir chạy trên **Erlang VM (BEAM)** — được thiết kế từ đầu cho distributed, fault-tolerant systems.

| BEAM Property | Ý nghĩa với Discord |
|---|---|
| Lightweight processes | Spin up 1 process/user session — millions đồng thời |
| Isolated heap per process | Crash 1 process không ảnh hưởng process khác |
| Preemptive scheduling | Không có 1 process nào block cả VM |
| Hot code reloading | Deploy không downtime |
| Distributed Erlang | Cluster các node communicate trong suốt |
| Let it crash philosophy | Supervisor tự restart process lỗi |

### 3.2 Guild Process Model

```
Mỗi Discord Server (Guild) = 1 GenServer process

┌─────────────────────────────────────────────────┐
│              Guild GenServer                     │
│                                                 │
│  State:                                         │
│  - online_members: MapSet                       │
│  - channel_states: Map                          │
│  - active_voice: Map                            │
│  - subscribed_sessions: [pid]                   │
│                                                 │
│  Handles:                                       │
│  - {:message_create, msg}                       │
│  - {:presence_update, user_id, status}          │
│  - {:typing_start, channel_id, user_id}         │
│  - {:voice_state_update, ...}                   │
└────────────────────┬────────────────────────────┘
                     │ fan-out via Distributed Erlang
          ┌──────────┼──────────┐
          ▼          ▼          ▼
    Session A   Session B   Session C
    (user WS)   (user WS)   (user WS)
```

**Vấn đề với large guilds**: Server 500k members → 1 GenServer process fan-out 500k messages = bottleneck.

**Solution**: Guild process **sharding** — tách guild thành nhiều sub-process theo partition (ví dụ theo member range).

```elixir
# Discord dùng ETS + :pg (Process Groups) thay vì single GenServer
# cho fan-out events ở quy mô lớn
:pg.get_members(:guild_subscriptions, guild_id)
|> Enum.each(&send(&1, {:event, payload}))
```

### 3.3 Session Process

```
Mỗi WebSocket connection = 1 Session GenServer

┌──────────────────────────────────────────────┐
│            Session GenServer                  │
│                                              │
│  State:                                      │
│  - user_id                                   │
│  - shard_id                                  │
│  - subscribed_guilds: [guild_pid]            │
│  - heartbeat_interval: 41250ms               │
│  - seq: integer (event sequence number)      │
│                                              │
│  Lifecycle:                                  │
│  IDENTIFY → READY → Receive events           │
│           ↓                                  │
│       RESUME (reconnect với session_id)      │
└──────────────────────────────────────────────┘
```

### 3.4 Presence System

```
Presence = Trạng thái online/offline/status của user

Flow:
1. User connect → Session process gửi {:presence_online, user_id} tới tất cả guilds user thuộc về
2. User disconnect → Session gửi {:presence_offline, ...}
3. Guild process fan-out PRESENCE_UPDATE event tới tất cả member sessions

Challenge: User trong 100 servers → disconnect = 100 guild processes nhận event đồng thời
```

**Semaphore pattern** (Discord open-source):

```elixir
# Dùng ETS atomic counter để rate-limit connection storms
defmodule Discord.Semaphore do
  def acquire(key, max) do
    case :ets.update_counter(:semaphore, key, {2, 1, max, max}, {key, 0}) do
      count when count <= max -> :ok
      _ -> :error
    end
  end

  def release(key) do
    :ets.update_counter(:semaphore, key, {2, -1, 0, 0})
  end
end
```

### 3.5 Push Notification Pipeline (GenStage)

```
Two-stage GenStage pipeline:

┌─────────────────────┐      demand=100     ┌──────────────────────┐
│   Push Collector    │ ◄──────────────────  │   Pusher Consumer    │
│  (1 per machine)    │                      │  (N workers)         │
│  Buffer: 1M+ req/min│ ──────────────────►  │  Firebase XMPP       │
└─────────────────────┘    batch of 100      └──────────────────────┘

- XMPP enforces 100 pending request limit → natural backpressure
- Khi buffer đầy: load-shedding (drop lowest priority)
- Không dùng HTTP Firebase vì thiếu backpressure mechanism
```

---

## 4. API LAYER — PYTHON MONOLITH

### 4.1 Kiến trúc API

Discord REST API là một **monolith Python** xử lý:
- CRUD cho Guilds, Channels, Users, Messages
- Authentication & Authorization
- Rate limiting
- Webhook delivery
- Permission checking

**Không phải microservice thuần túy** — Discord học được rằng "monolith có thể scale" nếu thiết kế đúng. Microservices chỉ được tách ra khi có yêu cầu kỹ thuật rõ ràng (latency, language fit).

### 4.2 Rate Limiting Architecture

```
Rate limit được enforce ở nhiều tầng:

Tầng 1: Cloudflare (IP-level, DDoS)
Tầng 2: API Gateway (global per-user: 50 req/s)
Tầng 3: Per-route buckets (khác nhau theo endpoint)
Tầng 4: Resource-level (per-guild emoji routes)

Response headers:
  X-RateLimit-Limit: 5
  X-RateLimit-Remaining: 0
  X-RateLimit-Reset: 1470173023
  X-RateLimit-Reset-After: 1.000
  X-RateLimit-Bucket: abcd1234
  Retry-After: 1.0  (nếu 429)

Đặc biệt: Emoji routes rate limit theo per-guild, không per-user
```

### 4.3 Permission System

Discord có **layered permission model**:

```
Permission resolution order (từ cao xuống thấp):
1. Guild Owner → bypass tất cả
2. Server-level role permissions
3. Channel-level permission overwrites (role)
4. Channel-level permission overwrites (user)
5. @everyone role permissions

Final permission = (base_perms | allow_overwrites) & ~deny_overwrites

Permissions stored as bitmask (64-bit integer):
  ADMINISTRATOR        = 1 << 3   (0x8)
  MANAGE_GUILD         = 1 << 5
  SEND_MESSAGES        = 1 << 11
  MANAGE_MESSAGES      = 1 << 13
  ...
```

---

## 5. DATA LAYER

### 5.1 Message Storage — Hành trình MongoDB → Cassandra → ScyllaDB

#### Phase 1: MongoDB (2015)
- Start với single MongoDB replica
- Hit limit tại ~100 triệu messages (Nov 2015)
- Vấn đề: random memory access pattern, hot data mixed với cold data

#### Phase 2: Cassandra (2017–2023)
- Scale tốt hơn, write throughput cao
- **Partition key**: `(channel_id, bucket)` — bucket = time-based grouping
- Đến 2022: **177 nodes**, trillions of messages
- Vấn đề phát sinh:
  - Hot partitions (popular channels)
  - p99 read latency: **40–125ms**
  - p99 write latency: **5–70ms** (spiky)
  - JVM GC pauses gây latency spikes
  - Operational overhead tăng không tuyến tính

#### Phase 3: ScyllaDB (2023–nay)
- Viết bằng C++ (không có JVM GC)
- Shard-per-Core architecture: mỗi CPU core có dedicated data partition + memory
- Kết quả sau migration:
  - Nodes: **177 → 72** (giảm 60%)
  - p99 read latency: **40–125ms → 15ms**
  - p99 write latency: **5–70ms → 5ms** (consistent)
  - Storage per node: 9TB (2x tăng)
  - Migration time: **9 ngày** (dùng Rust migrator tùy chỉnh)

#### Schema Design (Cassandra/ScyllaDB)

```sql
-- Messages table
CREATE TABLE messages (
  channel_id    bigint,
  bucket        int,        -- time bucket: message_id / bucket_size
  message_id    bigint,     -- Snowflake ID (time-sortable)
  author_id     bigint,
  content       text,
  attachments   list<frozen<attachment>>,
  edited_at     timestamp,
  PRIMARY KEY ((channel_id, bucket), message_id)
) WITH CLUSTERING ORDER BY (message_id DESC)
  AND compaction = {'class': 'LeveledCompactionStrategy'};
```

**Tại sao bucket?** Cassandra partition size limit (~100MB). Bucket chia data theo thời gian để tránh "infinite partition" của 1 channel bận rộn.

### 5.2 Data Services Layer (Rust) — Request Coalescing

```
Vấn đề: 1000 users cùng open channel X → 1000 DB queries giống nhau

Solution: Data Services là intermediate layer giữa API và DB

┌──────────┐   ┌──────────┐   ┌──────────┐
│  API req │   │  API req │   │  API req │
│  user A  │   │  user B  │   │  user C  │
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┴──────────────┘
                    │ request coalescing
                    ▼
          ┌─────────────────┐
          │  Data Service   │  ← Rust (fearless concurrency)
          │  (Rust + Tokio) │
          └────────┬────────┘
                   │ 1 query thay vì 3
                   ▼
              ScyllaDB / DB
```

**Request Coalescing**: Multiple identical in-flight requests → được gom thành 1 DB query → kết quả broadcast về tất cả waiters.

```rust
// Pseudo-code Data Service coalescing
async fn get_messages(channel_id: u64, request_id: Uuid) -> Vec<Message> {
    let key = format!("messages:{}", channel_id);

    // Check if same query already in-flight
    if let Some(waiter) = in_flight.get(&key) {
        return waiter.await; // Join existing request
    }

    // First requester: create new query
    let (tx, rx) = oneshot::channel();
    in_flight.insert(key.clone(), rx);

    let result = db.query_messages(channel_id).await;
    in_flight.remove(&key);
    tx.send(result.clone());
    result
}
```

### 5.3 Read States — Rust Service (Why Discord switched from Go)

Discord có một bài viết nổi tiếng: **"Why Discord is switching from Go to Rust"**.

**Read States**: Theo dõi tin nhắn nào user đã đọc → **extremely hot service** (mỗi message gửi = update read state của hàng nghìn users).

| | Go version | Rust version |
|---|---|---|
| Memory usage | Tăng theo thời gian (GC) | Ổn định |
| Latency spikes | Mỗi 2 phút (GC pause) | Không có |
| p99 latency | ~10ms (với spikes) | ~1ms |
| Throughput | Limited by GC | Significantly higher |

**Nguyên nhân**: Go GC pause khi cache bị invalidate → tất cả goroutines bị block. Rust không có GC.

### 5.4 Database Summary

| Database | Dùng cho | Lý do chọn |
|---|---|---|
| **ScyllaDB** | Messages (primary store) | Low latency, high throughput, CQL-compatible |
| **PostgreSQL** | Users, Guilds, Channels, Roles | ACID transactions, relational |
| **Cassandra** | Read States (legacy, một phần) | Write-heavy, eventual consistency OK |
| **Redis** | Session cache, rate limiting, temp data | In-memory speed |
| **Elasticsearch** | Message search index | Full-text search |
| **Google Cloud Storage** | Media files (images, attachments) | Durable object storage |
| **Cloudflare CDN** | Static assets, media delivery | Global edge caching |

---

## 6. VOICE LAYER

### 6.1 SFU Architecture

Discord dùng **SFU (Selective Forwarding Unit)** thay vì MCU (Multipoint Control Unit):

```
MCU (KHÔNG dùng):           SFU (Discord dùng):
A ─┐                        A ─────────────────► B
B ─┤─ MIX ─► A,B,C          A ─────────────────► C
C ─┘                        B ─────────────────► A
                             B ─────────────────► C
Server trộn audio (CPU cao)  Server chỉ forward (CPU thấp)
                             Client tự mix → per-user volume control
```

**Ưu điểm SFU**:
- Server CPU thấp hơn nhiều
- Client có thể control volume từng người
- Simulcast: mỗi sender encode nhiều quality levels

### 6.2 Voice Server Architecture

```
Voice Server = 2 components:

┌────────────────────────────────────────────┐
│           Voice Server                      │
│                                            │
│  ┌──────────────────────┐                 │
│  │  Signaling Component │  (Elixir)       │
│  │  - Session management│                 │
│  │  - Stream ID gen     │                 │
│  │  - Encryption keys   │                 │
│  │  - Server mute/deaf  │                 │
│  └──────────┬───────────┘                 │
│             │ controls                     │
│  ┌──────────▼───────────┐                 │
│  │    SFU (C++)         │                 │
│  │  - RTP packet fwd    │                 │
│  │  - Simulcast mgmt    │                 │
│  │  - Bandwidth est.    │                 │
│  │  - DTLS-SRTP         │                 │
│  └──────────────────────┘                 │
└────────────────────────────────────────────┘
```

### 6.3 DAVE Protocol — E2EE cho Voice/Video (từ Sept 2024)

```
DAVE = Discord's Audio and Video End-to-end Encryption

Bắt buộc từ March 1, 2026 cho tất cả DMs, GDMs, Voice Channels, Go Live

Key exchange: MLS (Messaging Layer Security) protocol
Encryption:   AES128-GCM AEAD
Per-sender ratcheted key:
  - Mỗi participant có key riêng
  - Key ratchet forward khi member join/leave
  - Prevents replay attacks

Transport encryption (DTLS-SRTP) vẫn tồn tại bên dưới DAVE
→ Double encryption layer
```

### 6.4 Audio Pipeline

```
Client → SFU → Client

Encode:  Opus codec, 48kHz, stereo, 8–64 kbps (adaptive)
Packet:  RTP header + Opus payload
Encrypt: DTLS-SRTP (transport) + AES128-GCM (E2EE)
NAT:     ICE protocol, UDP primary, WebSocket fallback

Voice Activity Detection (VAD):
  - Opus built-in VAD → suppress silence
  - Tránh gửi packet khi không ai nói
```

---

## 7. CLIENT LAYER

### 7.1 Web Client

```
Stack: React + TypeScript
State: Redux Toolkit (hoặc internal flux-like store)
WebSocket: Custom gateway client
WebRTC: Browser native APIs

Bundle strategy:
- Code splitting theo route
- Lazy load: member list, settings pages
- Critical path: gateway connection, message rendering
```

### 7.2 Desktop Client (Electron + C++)

```
Electron shell + C++ engine cho:
- Audio capture/playback (bypass OS audio ducking)
- Opus encoding/decoding
- DTLS-SRTP crypto
- GPU-accelerated rendering

Tại sao C++ thay vì Web Audio API?
- OS audio ducking phá vỡ game audio mix
- Lower latency với direct WASAPI/CoreAudio/ALSA access
- Better echo cancellation (WebRTC AEC module)
```

### 7.3 Gateway Client Protocol

```
Connection flow:
1. Client → WSS Gateway URL
2. Recv: HELLO opcode (heartbeat_interval: 41250ms)
3. Send: IDENTIFY { token, intents, properties, shard }
4. Recv: READY { session_id, guilds[], resume_gateway_url }

Heartbeat:
- Client gửi HEARTBEAT mỗi heartbeat_interval ms
- Server phải reply HEARTBEAT_ACK
- Không nhận ACK trong 1 interval → reconnect

Reconnect với RESUME:
- Gửi: RESUME { token, session_id, seq }
- Server replay missing events từ seq
- Nếu seq quá cũ → INVALID_SESSION → IDENTIFY lại

Sharding (required khi bot có ≥ 2500 guilds):
- shard_id = guild_id % num_shards
- Mỗi shard là 1 WebSocket connection riêng biệt
```

### 7.4 Snowflake ID

Discord dùng **Snowflake IDs** cho tất cả entity (message, user, guild, channel):

```
Snowflake = 64-bit integer

Bit layout:
┌────────────────────────┬──────────────┬─────────┬─────────┐
│   Timestamp (42 bits)  │ Worker (5bit)│Proc(5b) │Seq(12b) │
│   ms since Discord     │              │         │         │
│   Epoch (2015-01-01)   │              │         │         │
└────────────────────────┴──────────────┴─────────┴─────────┘

Properties:
- Globally unique
- Time-sortable (newest message = highest ID)
- Extract timestamp: (snowflake >> 22) + 1420070400000
- K-sortable → tốt cho Cassandra/ScyllaDB clustering
- No coordination needed giữa các workers
```

---

## 8. INFRASTRUCTURE

### 8.1 Cloud & CDN

```
Cloud Provider:  Google Cloud Platform (GCP)
CDN:             Cloudflare (global edge, DDoS protection)
Media Storage:   Google Cloud Storage
Container:       Kubernetes (GKE)
Service Mesh:    Internal (etcd cho service discovery)
```

### 8.2 Storage Topology (ScyllaDB trên GCP)

**Hybrid-RAID1 architecture** — thiết kế để có tốc độ của local SSD với độ bền của persistent disk:

```
Mỗi ScyllaDB node:
  Primary:  Local SSD (NVMe) → ultra-low latency reads/writes
  Mirror:   Persistent Disk (pd-ssd) → durability, survive node restart

RAID1 configuration:
  - mdadm mirror giữa local SSD và persistent disk
  - Read từ local SSD (fast path)
  - Write tới cả hai (durability)
  - Node restart: data vẫn còn trên persistent disk

Kết quả: Latency của local SSD + Durability của network disk
```

### 8.3 Global Deployment

```
Regions:
- US East (primary), US West
- Europe West, Europe Central
- Asia Pacific (Singapore, Japan, India)
- South America, Australia

Voice servers: Deploy gần hơn, nhiều region hơn
Gateway: Ít region hơn, mỗi region nhiều capacity

Client → Nearest Voice Server (based on latency measurement)
Client → Any Gateway (sticky session sau khi connect)
```

### 8.4 Service Discovery

```
etcd: Service registry cho Elixir cluster
  - Node registration on startup
  - Health check via heartbeat
  - Consistent hash ring cho guild placement

Distributed Erlang:
  - Default: fully meshed network
  - Discord: partial mesh để reduce connection overhead
  - etcd làm source of truth cho topology
```

---

## 9. SCALING RULES — BẮT BUỘC PHẢI TUÂN THỦ

### Rule #1: Thiết kế cho Failure, không phải cho Happy Path

```
✅ Mọi service phải có:
  - Health check endpoint (/health, /ready)
  - Graceful shutdown (drain connections trước khi tắt)
  - Circuit breaker (fail fast khi dependency down)
  - Retry với exponential backoff + jitter
  - Timeout trên tất cả external calls

❌ KHÔNG BAO GIỜ:
  - Assume network call thành công
  - Infinite retry không có backoff
  - Block thread chờ I/O
```

**Circuit Breaker Pattern**:
```python
# Dùng Tenacity hoặc custom implementation
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10)
)
async def call_external_service(payload):
    async with timeout(2.0):  # Hard timeout
        return await service.call(payload)
```

---

### Rule #2: Horizontal Scale, không Vertical Scale

```
❌ Vertical: Thêm RAM/CPU vào 1 server
✅ Horizontal: Thêm nhiều server nhỏ hơn

Implications:
- Service phải stateless (state ra ngoài service vào DB/Cache)
- Session không lưu in-memory trên app server
- Không dùng server-local file system cho data
- Load balancer health check phải pass ngay lập tức
- Không có "warm-up" logic bắt buộc

Trường hợp ngoại lệ (stateful OK):
- Gateway sessions (stateful by nature, managed với process model)
- Read-through cache (soft state, có thể rebuild)
```

---

### Rule #3: Partition Everything

**Sharding là chiến lược scale chính của Discord**:

```
Gateway Sharding:
  shard_id = (guild_id >> 22) % num_shards
  → Guild events chỉ đến đúng shard
  → Mỗi shard: ~5,000 guilds

Database Partitioning:
  Messages: Partition bằng (channel_id, bucket)
  Users:    Partition bằng user_id range
  Guilds:   Partition bằng guild_id range

Message Queue:
  Kafka topics được partition bằng guild_id
  → Events của cùng guild luôn cùng partition
  → Ordering được đảm bảo trong 1 guild

Quy tắc chọn partition key:
  1. Cardinality cao (nhiều unique values)
  2. Even distribution (không hot spot)
  3. Aligned với access pattern (queries ít cross-partition)
  4. Immutable (không đổi sau khi set)
```

---

### Rule #4: Asynchronous by Default

```
Synchronous (chỉ dùng khi cần):
  - Authentication (phải verify trước khi proceed)
  - Payment (cần confirmation ngay)
  - Permission check (security-critical)

Asynchronous (default cho tất cả còn lại):
  - Message delivery (fire and forget sau khi persist)
  - Notification push (best-effort)
  - Analytics event (lag OK)
  - Search index update (eventual consistency OK)
  - Email sending
  - Webhook delivery

Message Queue patterns:
  Producer → Kafka → Consumer (guaranteed at-least-once)
  Producer → Redis Pub/Sub → Consumer (best-effort, real-time)
  Producer → Dead Letter Queue → Retry handler
```

---

### Rule #5: Cache Aggressively, Invalidate Carefully

```
Cache hierarchy:
L1: Process memory (ETS trong Elixir, hashmap trong Rust)
    → Fastest, không persistent, limited size
    → TTL: seconds
    → Dùng cho: hot permission lookups, rate limit counters

L2: Redis cluster
    → Fast, shared across instances
    → TTL: minutes to hours
    → Dùng cho: user sessions, guild metadata, role data

L3: CDN (Cloudflare)
    → Global edge, content-based
    → TTL: hours to days
    → Dùng cho: static assets, media files

Cache invalidation strategies:
  - Write-through: Update cache khi update DB (consistency cao)
  - Cache-aside: DB là source of truth, cache miss → load từ DB
  - Event-driven: Kafka event trigger cache eviction

❌ TRÁNH:
  - Cache data không có TTL (stale data forever)
  - Cache toàn bộ response (khó invalidate granular)
  - Thundering herd: nhiều cache miss cùng lúc → DB spike
    → Fix: Mutex/semaphore khi rebuild cache, jitter trong TTL
```

---

### Rule #6: Observe Everything (Metrics, Logs, Traces)

```
3 Pillars of Observability:

1. METRICS (time-series)
   Tool: Prometheus + Grafana
   Capture:
   - Request rate, error rate, latency (RED metrics)
   - Queue depth, consumer lag
   - DB connection pool usage
   - GC pause duration (nếu có GC)
   - Custom business metrics (messages/s, concurrent users)

2. LOGS (structured, searchable)
   Format: JSON (machine-parseable)
   Required fields: timestamp, level, service, trace_id, request_id
   ❌ Không log: passwords, tokens, PII
   Tool: Elasticsearch / Loki

3. TRACES (distributed)
   Tool: OpenTelemetry + Jaeger / Tempo
   Instrument: mỗi service boundary
   Capture: span_id, parent_span_id, duration, error
   → Trace 1 request qua nhiều services

SLOs (Service Level Objectives) — phải define:
  API availability: 99.9% (43.8 min downtime/month)
  Gateway p99 latency: < 100ms
  Message delivery: < 500ms (p99)
  Voice latency: < 80ms RTT (p99)
```

---

### Rule #7: Idempotency cho mọi Write Operation

```
Vấn đề: Network timeout → client retry → duplicate message/payment

Solution: Idempotency key

Client tạo UUID cho mỗi request:
POST /channels/{id}/messages
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000

Server:
  1. Check Redis: key đã tồn tại chưa?
  2. Nếu có: return cached response (không execute lại)
  3. Nếu chưa: execute, store result với key (TTL: 24h)

Áp dụng cho:
  - Message creation
  - Payment processing
  - Server creation
  - Invite generation

Database level:
  - Snowflake ID as primary key → insert duplicate → conflict
  - ON CONFLICT DO NOTHING (PostgreSQL)
  - Conditional write (ScyllaDB: IF NOT EXISTS)
```

---

### Rule #8: Backpressure — Đừng Để Upstream Overwhelm Downstream

```
Vấn đề: Gateway nhận 1M events/s nhưng DB chỉ xử lý 100k/s

Solutions Discord dùng:

1. GenStage Backpressure (Elixir):
   Consumer demand-driven: chỉ kéo khi sẵn sàng
   Producer không push khi consumer bận

2. Queue với bounded buffer:
   Khi queue full → reject với 429, KHÔNG block producer
   Client retry sau Retry-After header

3. Load shedding:
   Khi system quá tải: drop low-priority events
   Priority: Payment > Message > Notification > Analytics

4. Rate limiting per-client:
   Ngăn 1 client chiếm toàn bộ capacity

Không bao giờ:
  - Unbounded queue (memory leak)
  - Block producer thread chờ consumer
  - Ignore 429 từ downstream
```

---

### Rule #9: Zero-Downtime Deployment

```
Deployment strategy: Rolling update + Blue-Green

Rolling update (stateless services):
  1. Deploy 1 pod mới
  2. Health check pass → remove 1 pod cũ
  3. Lặp lại cho tất cả pods
  → Zero downtime, nhưng 2 versions chạy đồng thời

Blue-Green (database schema change):
  Blue: version cũ
  Green: version mới
  1. Deploy Green song song với Blue
  2. Run DB migration tương thích backward (additive only)
  3. Shift traffic 0% → 10% → 50% → 100%
  4. Giám sát error rate tại mỗi step
  5. Rollback: shift traffic về Blue

Database migration rules:
  ✅ Được phép: ADD column (nullable), ADD index
  ✅ Được phép: CREATE new table
  ❌ Không được: DROP column (cần deprecate trước)
  ❌ Không được: RENAME column
  ❌ Không được: Change column type (incompatible)
  → 2-step: Old code ignore new column → Deploy → Remove old column later

Elixir Hot Code Loading:
  - BEAM hỗ trợ hot reload module mà không restart process
  - Guild/Session state được preserved
  - Dùng cho bug fixes khẩn cấp
```

---

### Rule #10: Design for the Worst Case, not Average Case

```
Capacity planning:
  - Tính theo p99, p999 — không phải average
  - Plan cho 10x traffic spike (viral event, outage recovery)
  - Auto-scaling với headroom 30% (không chờ đến 90% CPU rồi scale)

Large guild problem (Discord-specific):
  - Server 500k+ members = thundering herd khi celebrity posts
  - Design: guild sharding, event batching, fan-out limiting
  - Rate limit event fan-out: không broadcast tới 500k connections cùng lúc
  - Stagger delivery: batch + spread over time window

Hot partition problem:
  - Popular channel = hot Cassandra/ScyllaDB partition
  - Solution: Data Services request coalescing
  - Fallback: Read from secondary replica, serve slightly stale data

Message spike handling:
  - Write-ahead log (WAL) → accept write → async persist
  - Decouple accept từ persist: trả về 200 ngay khi WAL success
  - Background worker drain WAL vào DB
```

---

## 10. MICROSERVICE DECOMPOSITION RULES

### 10.1 Khi nào tách Microservice?

```
✅ Tách khi:
  - Scaling requirement khác nhau (voice server vs chat server)
  - Language/runtime khác nhau (Elixir gateway vs Rust read states)
  - Independent deployment lifecycle quan trọng
  - Team ownership rõ ràng
  - SLA/SLO khác nhau (payment service vs notification service)

❌ Không tách khi:
  - Chỉ vì "microservices là best practice"
  - Service quá nhỏ (chatty → network overhead)
  - Không có team riêng để own
  - Shared mutable state phức tạp giữa services
  - Premature optimization (monolith first, tách khi cần)
```

### 10.2 Service Communication

```
Synchronous (gRPC):
  - Service A cần kết quả ngay từ Service B
  - Permission check, auth validation
  - Ưu điểm: Simple, typed contracts (protobuf)
  - Nhược điểm: Coupling, cascade failure

Asynchronous (Kafka/Message Queue):
  - Fire and forget: message delivery, notifications
  - Event-driven: "message_created" → nhiều consumers
  - Ưu điểm: Decoupling, buffering, replay
  - Nhược điểm: Eventual consistency, harder to debug

Internal RPC (Distributed Erlang):
  - Elixir-to-Elixir: transparent process communication
  - PID là địa chỉ, cluster-transparent
  - Chỉ dùng trong Elixir cluster

API Contract:
  - OpenAPI spec cho REST endpoints
  - Protobuf cho gRPC
  - Avro/JSON Schema cho Kafka messages
  - Versioning: /v1/, /v2/ — KHÔNG break existing clients
```

### 10.3 Data Ownership

```
Mỗi service OWN data của mình:
  - Message Service → owns messages table
  - User Service → owns users table
  - Guild Service → owns guilds, channels, roles

Không được:
  ❌ Service A query trực tiếp database của Service B
  ❌ Shared database giữa 2 services (tight coupling)

Được phép:
  ✅ Service A gọi API của Service B để lấy data
  ✅ Service A subscribe events của Service B qua Kafka
  ✅ Materialized view: Service A cache subset data của B
```

---

## 11. TECH STACK SUMMARY CHO TỰ XÂY DỰNG

### 11.1 Stack khuyến nghị khi build Discord-like system

| Component | Discord dùng | Thay thế khuyến nghị |
|---|---|---|
| Gateway / WebSocket | Elixir + Cowboy | Elixir (chuẩn), hoặc Go + gorilla/websocket |
| REST API | Python (Django/aiohttp) | Python FastAPI / Go Gin / Node.js |
| Message Store | ScyllaDB | Cassandra (CQL-compatible) / DynamoDB |
| Relational Data | PostgreSQL | PostgreSQL |
| Cache | Redis Cluster | Redis / Valkey |
| Message Queue | Kafka | Kafka / RabbitMQ |
| Search | Elasticsearch | Elasticsearch / OpenSearch |
| Voice SFU | Custom C++ | mediasoup / Pion (Go) / LiveKit |
| Object Storage | GCS | S3 / GCS / MinIO (self-hosted) |
| CDN | Cloudflare | Cloudflare / CloudFront / Fastly |
| Container | Kubernetes (GKE) | Kubernetes / Docker Swarm |
| Service Discovery | etcd | etcd / Consul |
| Monitoring | Internal + GCP | Prometheus + Grafana + OpenTelemetry |
| Logging | Internal | ELK Stack / Grafana Loki |
| Tracing | Internal | Jaeger / Tempo |

### 11.2 Scaling Milestones

```
Phase 1 — MVP (0–10k users):
  - Monolith Python/Node.js + PostgreSQL + Redis
  - 1 WebSocket server
  - Simple horizontal scaling với load balancer
  - Không cần Kafka, không cần ScyllaDB

Phase 2 — Growth (10k–1M users):
  - Tách Gateway service ra (WebSocket dedicated servers)
  - Thêm Kafka cho async events
  - Redis Cluster thay vì single Redis
  - Read replicas cho PostgreSQL
  - CDN cho media

Phase 3 — Scale (1M–10M users):
  - Migrate message store → Cassandra/ScyllaDB
  - Implement Data Services với request coalescing
  - Gateway sharding
  - Multi-region deployment
  - Separate voice infrastructure
  - Microservice tách theo domain

Phase 4 — Hyperscale (10M+ users):
  - Discord-style Elixir cluster (BEAM)
  - Per-shard-core ScyllaDB
  - Custom SFU nếu mediasoup không đủ
  - Global anycast routing
  - ML-powered abuse detection
```

---

## 12. ANTI-PATTERNS — TUYỆT ĐỐI KHÔNG LÀM

| ❌ Anti-Pattern | Hậu quả | ✅ Đúng |
|---|---|---|
| Lưu session trong app memory | Không scale horizontal | Dùng Redis cho session |
| SELECT * từ messages table | Full scan → timeout | Luôn query theo partition key |
| Synchronous notification push | 1 user offline → block | Async queue |
| Retry không có backoff | Thundering herd | Exponential backoff + jitter |
| Shared database giữa services | Tight coupling | API hoặc event-driven |
| Deploy database migration non-additive | Downtime, rollback khó | Additive-only migration |
| Hard-code server address | Không scale, không failover | Service discovery |
| Log sensitive data (token, password) | Security incident | Scrub PII trước khi log |
| Unbounded queue | OOM | Bounded queue + load shedding |
| Fan-out tới 500k users đồng thời | Message broker quá tải | Batch + staggered delivery |
| Đặt logic business trong DB trigger | Khó debug, khó scale | Logic trong service layer |
| Không có timeout trên external call | Thread pool exhaustion | Hard timeout mọi external call |
| Coi database là message queue | Polling = DB load | Dùng Kafka/Redis Pub/Sub |

---

## 13. CHECKLIST KIẾN TRÚC TRƯỚC KHI DEPLOY

```
Reliability:
  □ Health check endpoint hoạt động (/health returns 200)
  □ Graceful shutdown implemented (drain in-flight requests)
  □ Circuit breaker cho tất cả downstream dependencies
  □ Retry với exponential backoff + jitter
  □ Timeout trên tất cả external I/O calls
  □ Dead Letter Queue cho failed messages

Scalability:
  □ Service stateless (state trong Redis/DB)
  □ Horizontal scaling đã test (tăng số replicas → throughput tăng)
  □ Database queries dùng đúng partition/shard key
  □ Không có N+1 query
  □ Cache layer đã implement với TTL hợp lý
  □ Backpressure mechanism có (queue bounded)

Observability:
  □ Structured JSON logging với trace_id
  □ Prometheus metrics: request rate, error rate, latency
  □ Distributed tracing span tại mỗi service boundary
  □ Alerting rules: error rate > 1%, p99 latency > threshold
  □ Dashboard cho on-call engineer

Deployment:
  □ Zero-downtime deployment (rolling update)
  □ Database migration backward-compatible
  □ Feature flag cho tính năng mới
  □ Rollback plan documented và tested
  □ Load test với 10x expected traffic

Security:
  □ Không có secret trong source code / git
  □ mTLS giữa internal services
  □ Rate limiting ở API layer
  □ Input validation trước khi DB write
  □ Least privilege cho service accounts
```

---

*Nguồn tham khảo: Discord Engineering Blog, ScyllaDB Summit talks, Elixir-lang blog, Discord Developer Documentation, public engineering interviews (2020–2026)*