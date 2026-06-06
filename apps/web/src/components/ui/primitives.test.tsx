import { render, screen } from '@testing-library/react';
import { Hash, X } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import {
  Avatar,
  Badge,
  Banner,
  Button,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRoot,
  ContextMenuTrigger,
  DialogContent,
  DialogRoot,
  DialogTrigger,
  IconButton,
  Skeleton,
  TextArea,
  TextField,
  Toast,
  ToastProvider,
  ToastViewport,
  Tooltip,
  TooltipProvider
} from '.';

describe('ui primitives', () => {
  it('renders buttons with accessible icon labels', () => {
    render(
      <>
        <Button>Save</Button>
        <IconButton label="Close">
          <X aria-hidden="true" />
        </IconButton>
      </>
    );

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveAttribute('title', 'Close');
  });

  it('renders form controls with labels and error state', () => {
    render(
      <>
        <TextField id="server-name" label="Server name" error="Required" />
        <TextArea id="topic" label="Topic" hint="Optional" />
      </>
    );

    expect(screen.getByLabelText('Server name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Topic')).toBeInTheDocument();
  });

  it('renders feedback primitives', () => {
    render(
      <>
        <Avatar alt="Ada Lovelace" />
        <Badge>3</Badge>
        <Skeleton data-testid="skeleton" />
        <Banner>Connected</Banner>
      </>
    );

    expect(screen.getByText('Ad')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Connected');
  });

  it('renders Radix-backed dialog, tooltip, context menu, and toast roots', () => {
    render(
      <TooltipProvider>
        <ToastProvider>
          <DialogRoot open>
            <DialogTrigger>Open dialog</DialogTrigger>
            <DialogContent title="Create channel" description="Choose a name">
              Body
            </DialogContent>
          </DialogRoot>
          <Tooltip content="Text channel">
            <button type="button">
              <Hash aria-hidden="true" />
              Channel
            </button>
          </Tooltip>
          <ContextMenuRoot>
            <ContextMenuTrigger>Message</ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem>Reply</ContextMenuItem>
            </ContextMenuContent>
          </ContextMenuRoot>
          <Toast title="Saved" description="Your changes are live." />
          <ToastViewport />
        </ToastProvider>
      </TooltipProvider>
    );

    expect(screen.getByRole('dialog', { name: 'Create channel' })).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });
});
