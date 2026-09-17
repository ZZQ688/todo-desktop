export function InlineMutationError({ show, error }: { show: boolean; error: string | null }) {
  if (!show) return null;
  return <p className="modal-error" role="alert">{error ?? "操作失败，请重试。"}</p>;
}
