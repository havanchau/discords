# Discord Security Issues
> Tài liệu tổng hợp các vấn đề bảo mật liên quan đến Discord app — bao gồm CVE, attack vector, abuse patterns và biện pháp phòng ngừa. Dành cho developer, security researcher, và server admin.

---

## 1. KNOWN CVEs

### CVE-2024-23739 — Remote Code Execution (macOS)
| Trường | Chi tiết |
|---|---|
| **Nền tảng** | Discord for macOS ≤ 0.0.291 |
| **CVSS Score** | 9.8 (Critical) |
| **EPSS Score** | 35.77% |
| **Published** | 2024-01-28 |
| **CWE** | CWE-94: Improper Control of Code Generation |

**Mô tả**: Kẻ tấn công từ xa có thể thực thi arbitrary code thông qua hai setting của Electron app là `RunAsNode` và `enableNodeCliInspectArguments`. Discord desktop dựa trên Electron — khi hai flag này không bị disable, attacker có thể inject Node.js code vào process của Discord.

**Attack Vector**: Remote — không cần physical access.

**Fix**: Cập nhật Discord macOS lên phiên bản > 0.0.291. Anthropic patched bằng cách disable `RunAsNode` trong production build.

---

### CVE-2025-4525 — Thông tin chưa đầy đủ (Đang theo dõi)
| Trường | Chi tiết |
|---|---|
| **Nền tảng** | Discord (đang xác minh) |
| **Status** | Published 2025, details pending |

**Lưu ý**: CVE này chưa có public writeup đầy đủ tại thời điểm ghi. Theo dõi tại [cve.akaoma.com/vendor/discord](https://cve.akaoma.com/vendor/discord).

---

### CVE-2026-24332 — Information Disclosure (Invisible Status Bypass)
| Trường | Chi tiết |
|---|---|
| **Nền tảng** | Discord Web / Desktop (tất cả phiên bản) |
| **CVSS** | Medium |
| **CWE** | CWE-204: Observable Response Discrepancy |
| **Published** | 2026-01-23 |

**Mô tả**: Discord's WebSocket API trả về user có status "Invisible" trong `presences` array với `"status": "offline"`, trong khi user thực sự offline thì **không xuất hiện** trong array. Kẻ tấn công có thể phân biệt "Invisible" vs "Truly Offline" bằng cách so sánh sự có mặt/vắng mặt của user trong presences array.

**Impact**: Privacy violation — người dùng tin rằng mình đang ẩn, nhưng thực chất vẫn bị phát hiện là đang online.

**Attack Method**:
```
1. Kết nối WebSocket tới Discord Gateway
2. Query presences array
3. Nếu user xuất hiện với "status": "offline" → đang Invisible
4. Nếu user không xuất hiện → thực sự offline
```

---

### CVE-2021-29466 — Local File Read (Discord-Recon Bot)
| Trường | Chi tiết |
|---|---|
| **Nền tảng** | Discord-Recon bot ≤ 0.0.3 |
| **CVSS** | 7.5 (High) |
| **CWE** | CWE-22: Path Traversal |

**Mô tả**: Remote attacker có thể đọc file local trên server chạy bot thông qua path traversal (`../`) trong tham số `recon` function.

**Fix**: Thêm `.replace('..', '')` vào biến `Path`. Patched trong version 0.0.4.

---

### CVE (Unassigned) — DLL Search Order Hijacking (Windows)
| Trường | Chi tiết |
|---|---|
| **Nền tảng** | Discord 1.0.9188 on Windows |
| **CVSS** | Critical |
| **CWE** | CWE-427: Uncontrolled Search Path Element |

**Mô tả**: Discord trên Windows load thư viện `WINSTA.dll` theo search order không kiểm soát. Attacker local có thể đặt DLL độc hại cùng tên vào thư mục mà Discord tìm kiếm trước → DLL hijacking → arbitrary code execution.

**Attack complexity**: High (cần local access).

---

## 2. ATTACK VECTORS & ABUSE PATTERNS

### 2.1 Discord Token Theft

**Mức độ nguy hiểm**: 🔴 Critical

Discord user token là chuỗi base64 xác thực phiên làm việc. Ai có token = có toàn quyền tài khoản đó mà không cần password hay MFA.

**Cách token bị đánh cắp:**

| Method | Cơ chế | Phổ biến |
|---|---|---|
| **Malware / Infostealer** | Đọc file `Local Storage` của Discord (Electron lưu token dạng plain text) | ★★★★★ |
| **Browser extension độc hại** | Extension có quyền đọc storage của trang Discord web | ★★★☆☆ |
| **Phishing page** | Trang giả mạo Discord login, capture credentials rồi relay | ★★★★☆ |
| **XSS trong embed/webhook** | Inject script để exfiltrate token (đã được mitigate phần lớn) | ★★☆☆☆ |
| **Malicious npm package** | Package được cài vào project của dev, tự động gửi token | ★★★☆☆ |

**Token storage location (Desktop Electron app):**
```
Windows: %AppData%\discord\Local Storage\leveldb\
macOS:   ~/Library/Application Support/discord/Local Storage/leveldb/
Linux:   ~/.config/discord/Local Storage/leveldb/
```

**Infostealer nổi bật nhắm Discord token:**
- **VVS Stealer** (Python/Pyarmor, xuất hiện từ April 2025) — bán trên Telegram từ €10/tuần
- **Lumma Stealer** (C, phân phối qua Discord CDN)
- **Skuld Stealer** (Go, open-source, được customize)
- **RedLine Stealer**, **RisePro**, **Cinoshi**

**Mitigation:**
```
- Bật 2FA trên tài khoản Discord
- Không cài ứng dụng lạ, đặc biệt "game cheat", "mod", "tool"
- Thường xuyên revoke session tại Settings → Devices
- Dùng password manager, không lưu password trực tiếp
- Developer: KHÔNG hardcode token vào source code / config
```

---

### 2.2 Discord CDN Abuse — Malware Hosting

**Mức độ nguy hiểm**: 🔴 Critical

**Cơ chế**: Khi file được upload lên Discord, Discord CDN (`cdn.discordapp.com`) tạo một **public permanent link** có thể truy cập không cần đăng nhập. Attacker lợi dụng điều này:

```
1. Upload malware lên Discord channel bất kỳ (kể cả server riêng tư)
2. Lấy public CDN link
3. Nhúng link vào phishing email, social media, hoặc message
4. Nạn nhân click link → tải malware trực tiếp từ discord.com → qua được nhiều firewall/filter
```

**Tại sao nguy hiểm:**
- Link có domain `cdn.discordapp.com` hoặc `media.discordapp.net` — nhiều tổ chức không chặn Discord CDN
- Nạn nhân **không cần cài Discord** để tải file từ CDN
- Malware loader quen thuộc dùng kỹ thuật này: **SmokeLoader**, **PrivateLoader**, **Amadey**
- Payload thường là: **Lumma**, **RedLine**, **RisePro**

**Discord đã phản hồi**: Triển khai URL expiration cho một số CDN links từ cuối 2023, nhưng chưa hoàn toàn khóa được attack vector này.

---

### 2.3 Discord Invite Link Hijacking

**Mức độ nguy hiểm**: 🟠 High

**Check Point Research (2025)** ghi nhận chiến dịch tấn công khai thác **expired vanity invite links**:

```
Attack flow:
1. Tìm Discord invite link cũ (expired) trong website, GitHub, documentation
2. Đăng ký lại vanity URL đó (vd: discord.gg/legit-project)
3. Tạo server giả mạo với tên/icon giống server thật
4. Nạn nhân click link cũ → bị chuyển đến server độc hại
5. Server yêu cầu "verify" qua bot giả mạo
```

**Trong chiến dịch 2025:**
- Bot giả tên **"Safeguard#0786"** (tạo 01/02/2025) yêu cầu OAuth2 authorization
- Redirect về `captchaguard[.]me` — trang phishing
- Sau authorization: tải **AsyncRAT** + **Skuld Stealer** (nhắm crypto wallet)
- Kỹ thuật **ClickFix** + **time-based evasion** để bypass sandbox

**Mitigation:**
```
- Luôn dùng permanent invite links (không expiry) cho project quan trọng
- Kiểm tra invite link trước khi đăng tải lên website/docs
- Không grant permission OAuth2 cho bot không rõ nguồn gốc
- Server admin: bật 2FA requirement cho moderator
```

---

### 2.4 Malicious Bot Attacks

**Mức độ nguy hiểm**: 🟠 High

**Các loại bot tấn công phổ biến:**

| Loại | Hành vi |
|---|---|
| **Phishing bot** | Gửi DM với link giả Nitro, giả Steam, giả airdrop |
| **Spam bot** | Flood channel, @everyone mention spam |
| **Raid bot** | Join hàng loạt → spam → gây thiệt hại reputation |
| **C2 bot** | Malware trên máy nạn nhân dùng Discord bot làm Command & Control channel |
| **Token logger bot** | Giả dạng bot hữu ích, thực chất ghi lại token của user authorize |
| **Selfbot** | Tự động hóa user account (vi phạm ToS Discord) |

**Discord API bị dùng làm C2 (Command & Control):**
- Malware giao tiếp qua Discord bot API → traffic trông như bình thường
- Lệnh gửi qua Discord message → khó detect bằng network monitoring thông thường
- Data exfiltration qua webhook → gửi thẳng tới attacker's Discord server

---

### 2.5 Fake Nitro / Gift Link Scams

**Mức độ nguy hiểm**: 🟡 Medium-High

```
Cơ chế chuẩn:
1. User nhận DM / message: "You've been gifted Nitro! Claim: discord.gift/xxxxx"
2. Link trỏ về trang phishing (vd: dlscord.com, discorcl.com, discordgift.site)
3. Trang yêu cầu đăng nhập Discord → steal credentials
4. Một số redirect về QR code login → Session hijacking
```

**Biến thể 2024-2025:**
- Dùng Discord OAuth2 để "verify" → lấy access token
- Kết hợp với Steam gift scam — bảo người dùng vote game để nhận Nitro
- Nhắm developer: giả Steam API key exchange → lấy credentials

---

### 2.6 Server Raiding

**Mức độ nguy hiểm**: 🟡 Medium

Raid là tấn công phối hợp vào Discord server:
- Nhiều account cùng join trong thời gian ngắn
- Spam text, image không phù hợp, @everyone
- Mục tiêu: gây chaos, phá reputation, dẫn đến server bị Discord ban

**Công cụ raid thường dùng**: `discord.py` selfbot, `nukers`, `spammers` — bán/share trên các diễn đàn underground.

**Mitigation (Server Admin):**
- Bật **Membership Screening** (yêu cầu xác nhận rules trước khi vào)
- Bật **Verification Level** cao nhất cho server public
- Bật **RAID Protection** trong AutoMod
- Giới hạn invite link (max 100 uses, expiry 24h)
- Role không có quyền gửi message ngay khi join

---

### 2.7 Third-Party Data Breach (October 2025)

**Mức độ nguy hiểm**: 🟠 High

**Sự cố**: Tháng 10/2025, một vendor hỗ trợ Discord (ticketing/customer support system) bị tấn công. **1.5TB dữ liệu** bao gồm ~2 triệu ảnh ID bị đánh cắp và giữ để tống tiền.

**Dữ liệu bị lộ:**
- Username và Discord username
- Email address
- Customer support message transcripts
- IP addresses
- Thông tin thanh toán giới hạn (phương thức + 4 số cuối thẻ)

**Lưu ý**: Discord core infrastructure **không bị breach**. Đây là supply chain attack nhắm vào third-party vendor, không phải Discord trực tiếp.

---

### 2.8 Electron App Attack Surface

**Mức độ nguy hiểm**: 🟠 High (cho Desktop App)

Discord Desktop là **Electron app** — về bản chất là Chromium browser + Node.js runtime. Điều này tạo ra bề mặt tấn công lớn hơn native app:

| Vấn đề | Chi tiết |
|---|---|
| **nodeIntegration** | Nếu bật, web content có thể gọi Node.js API → RCE |
| **contextIsolation** | Nếu tắt, renderer process có thể access main process |
| **Token lưu plain text** | LocalStorage của Electron không encrypt → dễ đọc |
| **RunAsNode flag** | Liên quan CVE-2024-23739 trên macOS |
| **Protocol handler abuse** | `discord://` deep link có thể bị khai thác |
| **Auto-update hijacking** | Nếu update mechanism không verify signature đúng cách |

---

## 3. DEVELOPER SECURITY ISSUES

### 3.1 Bot Token Exposure

Lỗi phổ biến nhất trong cộng đồng Discord developer:

**❌ Sai — Hardcode token:**
```python
# TUYỆT ĐỐI KHÔNG LÀM
bot.run("MTxxxxxxxxxxxxxxxxxxxxxxxx.Gxxxxx.xxxxxxxxxxxxxxxxxxxxxxxxxxx")
```

**✅ Đúng — Environment variable:**
```python
import os
from dotenv import load_dotenv

load_dotenv()
bot.run(os.getenv("DISCORD_TOKEN"))
```

**`.gitignore` bắt buộc:**
```
.env
*.env
config.json
secrets.json
```

**Nếu token đã bị leak:**
```
1. Vào Discord Developer Portal → Applications → Bot
2. Click "Reset Token" NGAY LẬP TỨC
3. Cập nhật token trong environment
4. Kiểm tra git history: git log --all -p | grep -i token
5. Nếu commit lên GitHub: dùng BFG Repo Cleaner để xóa khỏi history
6. Report tới GitHub Secret Scanning nếu dùng GitHub
```

**Các nguồn leak token phổ biến:**
- Commit `.env` file lên public GitHub
- Screenshot config file trong Discord channel
- Paste code vào Stack Overflow có chứa token
- `config.json` không nằm trong `.gitignore`

---

### 3.2 Webhook URL Exposure

Webhook URL cũng nguy hiểm như token — ai có URL có thể gửi message vào channel đó.

**Risks:**
- Attacker spam/flood channel
- Gửi nội dung không phù hợp dưới danh nghĩa bot
- Discord sẽ disable webhook nếu bị abuse → mất alert/notification system

**Mitigation:**
```
- Không commit webhook URL vào source code
- Dùng environment variable tương tự token
- Nếu bị lộ: Delete webhook trong Channel Settings → Integrations
- Tạo webhook mới và cập nhật config
```

---

### 3.3 Permission Over-Granting (Least Privilege Violation)

**Vấn đề**: Nhiều bot yêu cầu `Administrator` permission dù không cần thiết.

**Nguyên tắc**: Chỉ request permission thực sự cần:

```python
# Thay vì permissions=8 (Administrator)
# Tính toán chính xác permissions cần thiết:

from discord import Permissions
perms = Permissions(
    send_messages=True,
    read_messages=True,
    embed_links=True,
    attach_files=True,
    read_message_history=True,
    # Chỉ thêm gì bot thực sự dùng
)
```

**Dùng Discord Permission Calculator**: https://discordapi.com/permissions.html

---

### 3.4 Rate Limiting & Abuse

Discord API áp dụng rate limit để chống spam:

| Limit | Giá trị |
|---|---|
| Global rate limit (bot) | 50 requests/giây |
| IP ban threshold | 10,000 invalid requests / 10 phút |
| IP ban duration | 24 giờ |
| Cloudflare ban override | Có thể request tăng lên 1,200 req/s |

**Nếu bot bị rate limit mà không handle:**
- HTTP 429 → bot crash hoặc message bị miss
- Retry liên tục → IP ban 24h
- Toàn bộ bot bị ảnh hưởng

**Proper rate limit handling:**
```python
# discord.py tự handle rate limit nếu dùng đúng
# Nhưng với HTTP requests thủ công:
import asyncio

async def safe_request(endpoint):
    while True:
        response = await make_request(endpoint)
        if response.status == 429:
            retry_after = response.headers.get("Retry-After", 1)
            await asyncio.sleep(float(retry_after))
            continue
        return response
```

---

### 3.5 Input Validation & Injection

**Command Injection qua Bot:**
```python
# ❌ Nguy hiểm — eval user input
@bot.command()
async def calc(ctx, *, expression):
    result = eval(expression)  # RCE nếu expression = "__import__('os').system('rm -rf /')"
    await ctx.send(result)

# ✅ Dùng thư viện safe math
import ast
import operator

def safe_eval(expr):
    # Chỉ cho phép operators nhất định
    allowed = {ast.Add, ast.Sub, ast.Mult, ast.Div}
    # ... implement safe evaluator
```

**SQL Injection qua user input:**
```python
# ❌ Nguy hiểm
query = f"SELECT * FROM users WHERE name = '{user_input}'"

# ✅ Parameterized query
query = "SELECT * FROM users WHERE name = ?"
cursor.execute(query, (user_input,))
```

---

### 3.6 OAuth2 Security Pitfalls

**Vấn đề thường gặp với Discord OAuth2:**

| Issue | Mô tả | Fix |
|---|---|---|
| **State parameter missing** | Không dùng `state` → dễ bị CSRF | Luôn generate và verify `state` |
| **Scope quá rộng** | Request `email` khi chỉ cần `identify` | Minimize scope |
| **Token stored insecurely** | Lưu access token trong localStorage | Dùng httpOnly cookie hoặc server-side session |
| **No token refresh** | Access token expire → user bị logout | Implement refresh token flow |
| **Redirect URI mismatch** | Không validate redirect_uri | Whitelist strict redirect URIs trong Developer Portal |

**Luôn verify token server-side:**
```javascript
// Không tin tưởng user_id từ client
// Luôn verify qua Discord API
const response = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` }
});
const user = await response.json();
// user.id là ground truth
```

---

### 3.7 Selfbot (Automating User Accounts)

**Selfbot = Dùng user token (không phải bot token) để tự động hóa.**

**Tại sao nguy hiểm:**
- **Vi phạm Discord ToS** → ban tài khoản vĩnh viễn
- User token có quyền truy cập toàn bộ tài khoản (DM, payment info, email)
- Nếu lộ token → mất tất cả

**Discord cấm rõ ràng**: "Developers must abide by the terms of service, which includes refraining from automating standard user accounts (generally called 'self-bots') outside of the OAuth2/bot API."

---

## 4. USER-LEVEL SECURITY ISSUES

### 4.1 Account Takeover Vectors

| Vector | Mô tả |
|---|---|
| **QR Code Login Hijack** | Attacker hiện QR code Discord login → nạn nhân scan → session bị chiếm ngay lập tức |
| **Credential Stuffing** | Dùng username/password bị leak từ breach khác để thử login Discord |
| **Phishing page** | Trang login giả mạo (`dlscord.com`, `discorcl.com`) |
| **Session token theft** | Đọc token từ localStorage của browser |
| **Social engineering** | Giả mạo Discord Staff yêu cầu verify account |

**QR Code attack là nguy hiểm nhất** — xảy ra trong giây lát, không cần nhập password. Attacker gửi QR code, bảo nạn nhân scan để "verify" hoặc nhận thưởng.

**Phòng ngừa:**
```
✅ Bật 2FA (Authenticator App, không phải SMS)
✅ Không scan QR code Discord từ người lạ
✅ Kiểm tra URL kỹ trước khi login (discord.com, không phải discorcl.com)
✅ Không click link trong DM từ người không quen
✅ Revoke sessions thường xuyên: Settings → Devices → Log Out All Known Devices
```

---

### 4.2 Privacy Issues

**Ip Address Exposure:**
- Discord dùng WebRTC cho voice chat → có thể leak IP address trong một số điều kiện
- Voice server IP ≠ user IP nhưng một số third-party exploit có thể khai thác

**Metadata Collection:**
- Discord thu thập: login timestamp, device info, IP address, OS version
- Dữ liệu có thể bị lộ qua breach third-party (xem sự cố 2025 ở trên)

**DM Privacy:**
- Discord có thể đọc DM nếu được yêu cầu bởi pháp luật
- DM không có **end-to-end encryption** (E2E)
- Nội dung DM được lưu trên server Discord

---

### 4.3 Phishing & Social Engineering Lures

**Top lures Discord 2024–2025:**

| Lure | Mô tả |
|---|---|
| **Free Nitro** | "Bạn được tặng 3 tháng Nitro! Click để nhận" |
| **Steam gift** | "Vote game của mình để nhận Steam gift card" |
| **Server partnership** | "Chúng tôi muốn partner với server của bạn" |
| **Staff impersonation** | "Discord Trust & Safety team yêu cầu bạn verify" |
| **Crypto airdrop** | "Server NFT/Crypto mời bạn claim airdrop" |
| **Game cheat tool** | File exe giả cheat → thực chất là infostealer |
| **Bot verification** | Bot giả "Safeguard" yêu cầu authorize → phishing |

**Red flags cần nhận biết:**
```
🚩 Yêu cầu urgent action ("Tài khoản bị suspend trong 24h")
🚩 Offer quá tốt để là thật (free Nitro, free gift card)
🚩 Link dẫn ra ngoài discord.com
🚩 Bot yêu cầu permission không liên quan
🚩 Message từ friend bị hack với nội dung bất thường
🚩 QR code login để "claim" phần thưởng
```

---

## 5. SERVER ADMIN SECURITY CHECKLIST

### 5.1 Server Hardening

```
□ Bật Verification Level: Medium hoặc High
   (Medium = verified email, High = 10 phút member)

□ Bật Explicit Media Content Filter: Scan messages from all members

□ Cấu hình AutoMod rules:
   - Block known scam phrases ("free nitro", "claim your gift")
   - Block mention spam (>5 mentions/message)
   - Block link từ unknown domains

□ Membership Screening bật — user phải accept rules mới vào được

□ Audit Log theo dõi: bật và review định kỳ

□ 2FA requirement cho Moderator trở lên:
   Server Settings → Safety Setup → Require 2FA for moderator actions

□ Giới hạn ai có thể tạo invite link

□ Không cấp Administrator cho bot — tính chính xác permissions

□ Review bot permissions định kỳ — remove bot không dùng nữa
```

### 5.2 Bot Security trong Server

```
□ Chỉ add bot từ nguồn uy tín (discord.com/application-directory)
□ Xem xét kỹ permissions trước khi authorize
□ Không authorize bot yêu cầu Administrator nếu không cần thiết
□ Kiểm tra bot có verified badge không
□ Remove bot không hoạt động hoặc không rõ nguồn gốc
□ Đặt giới hạn: chỉ Server Owner mới có thể add bot
```

---

## 6. INCIDENT RESPONSE

### 6.1 Nếu Tài Khoản Bị Compromise

```
1. Ngay lập tức đổi password tại discord.com/login
2. Bật 2FA nếu chưa có
3. Vào Settings → Devices → đăng xuất tất cả sessions
4. Kiểm tra: Settings → Authorized Apps → revoke app không nhận ra
5. Kiểm tra email để xem có liên kết email mới không
6. Báo cáo cho Discord: dis.gd/report
7. Thông báo cho các server admin nếu account đã bị dùng để spam
```

### 6.2 Nếu Bot Token Bị Lộ

```
1. Discord Developer Portal → Application → Bot → Reset Token (NGAY)
2. Cập nhật .env / secrets manager với token mới
3. Restart bot
4. Kiểm tra bot có thực hiện hành động bất thường không (audit log)
5. Xóa token khỏi git history (BFG Repo Cleaner)
6. Review toàn bộ permissions bot đang có
```

### 6.3 Nếu Server Bị Raid

```
1. Tạm thời bật: Server Settings → Safety Setup → Raid Protection (DeveloperMode)
2. Tăng Verification Level lên Highest
3. Tắt invite links tạm thời
4. Ban + prune raiders (Developer Mode: chuột phải → Ban + Delete messages)
5. Sau khi ổn: Review audit log để tìm điểm vào
6. Cân nhắc thêm bot chống raid (Wick, Beemo)
```

---

## 7. RESOURCES

| Resource | URL |
|---|---|
| Discord Bug Bounty Program | https://discord.com/security |
| Discord Security Advisories | https://discord.com/category/safety |
| Report Abuse | https://dis.gd/report |
| CVE Database (Discord) | https://www.cvedetails.com/vendor/23159/Discord.html |
| Discord Safety Center | https://discord.com/safety |
| Request Rate Limit Increase | https://dis.gd/rate-limit |
| Discord Developer Docs (OAuth2) | https://discord.com/developers/docs/topics/oauth2 |

---

## 8. SEVERITY MATRIX

| Issue | Severity | Impact | Likelihood |
|---|---|---|---|
| Token theft via infostealer | 🔴 Critical | Account takeover | High |
| CVE-2024-23739 (macOS RCE) | 🔴 Critical | Full RCE | Medium |
| CDN malware hosting | 🔴 Critical | Widespread malware delivery | High |
| QR code session hijack | 🔴 Critical | Instant account takeover | Medium |
| Invite link hijacking | 🟠 High | Phishing, malware | Medium |
| Webhook URL exposure | 🟠 High | Channel spam/abuse | High |
| Bot token in public repo | 🟠 High | Bot compromise | High |
| Invisible status bypass | 🟡 Medium | Privacy violation | High |
| DLL hijacking (Windows) | 🟡 Medium | Local RCE | Low |
| Server raiding | 🟡 Medium | Reputation damage | Medium |
| Phishing/social engineering | 🟡 Medium | Credential theft | High |
| No 2FA on account | 🟡 Medium | Brute force risk | High |
| Over-granted bot permissions | 🟢 Low | Scope creep on breach | Medium |
| DM not E2E encrypted | 🟢 Low | Gov/legal exposure | Low |

---

*Last updated: May 2026 — Based on public CVEs, security research (Check Point, Trend Micro, Intel 471, CYFIRMA, Palo Alto Unit 42) và Discord official documentation.*