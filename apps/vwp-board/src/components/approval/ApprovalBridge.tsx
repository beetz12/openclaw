"use client";

import { useRef, useCallback } from "react";
import { useCustomEvent } from "@/lib/lit-wrappers";

interface ApprovalBridgeProps {
  isOpen: boolean;
  taskId: string;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onCancel: () => void;
}

/**
 * React wrapper around the <vwp-approval-dialog> Lit web component.
 * Bridges custom events (confirm-reject, cancel) to React callbacks.
 */
export function ApprovalBridge({
  isOpen,
  taskId,
  onApprove,
  onReject,
  onCancel,
}: ApprovalBridgeProps) {
  const dialogRef = useRef<HTMLElement>(null);

  const handleConfirmReject = useCallback(
    (detail: unknown) => {
      const data = detail as { reason?: string; approved?: boolean } | undefined;
      if (data?.approved) {
        onApprove();
      } else {
        onReject(data?.reason ?? "");
      }
    },
    [onApprove, onReject],
  );

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  useCustomEvent(dialogRef, "confirm-reject", handleConfirmReject);
  useCustomEvent(dialogRef, "cancel", handleCancel);

  if (!isOpen) {return null;}

  return (
    <vwp-approval-dialog
      ref={dialogRef}
      open={isOpen}
      messageId={taskId}
    />
  );
}
