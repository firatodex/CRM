// ConfirmModal.jsx
// Replaces native browser confirm() which is blocked in many iframe/browser
// contexts and provides no styling control. Used for destructive actions (delete).

export default function ConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, onCancel }) {
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <div className="modal-title" style={{ color: 'var(--error)' }}>{title}</div>
        <p style={{ fontSize: 14, color: 'var(--text-body)', margin: '12px 0 20px', lineHeight: 1.6 }}>
          {message}
        </p>
        <div className="modal-actions">
          <div className="spacer" />
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
