import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  fileToQrDataUrl,
  formatInrExact,
  getPaymentRequestPayin,
  paymentRequestTotals,
  sanitizePdfName,
  savePaymentRequestPayin,
} from '../utils/paymentRequestSettings'
import './paymentRequest.css'

const COPY = {
  advance: {
    docSubtitle: 'Advance payment · Project kickoff',
    mainTitle: "Let's kick-start your project.",
    mainSub: 'Thank you for choosing DYZEN Solar Technologies. Please use the details below to make the advance payment and confirm project commencement.',
    heroLabel: 'Requested advance',
    heroNote: 'Project advance before commencement',
    baseAmountLabel: 'Base amount (₹)',
    baseLabel: 'Base amount',
    totalLabel: 'Amount payable',
    modeStatus: 'Advance payment',
  },
  general: {
    docSubtitle: 'Payment request',
    mainTitle: 'Your payment request from DYZEN.',
    mainSub: 'Thank you for choosing DYZEN Solar Technologies. Please use the details below to complete your payment at your convenience.',
    heroLabel: 'Requested amount',
    heroNote: 'Payment request',
    baseAmountLabel: 'Amount (₹)',
    baseLabel: 'Amount',
    totalLabel: 'Amount payable',
    modeStatus: 'General request',
  },
}

function eyebrowFor(client) {
  if (!client) return 'Payment request'
  if (client.company) return client.company
  return client.name
}

function rupee(n) {
  return `₹${formatInrExact(n)}`
}

function waitTwoFrames() {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve)
    })
  })
}

function PaymentRequestSheet({
  sheetRef,
  hostRef,
  client,
  mode,
  note,
  totals,
  gstEnabled,
  payin,
}) {
  const baseText = rupee(totals.base)
  const gstText = rupee(totals.gst)
  const totalText = rupee(totals.total)
  const heroAmount = gstEnabled
    ? `${baseText} + ${totals.gstRate}% GST`
    : `${baseText} (GST not applicable)`

  return (
    <div className="payreq-capture-host" ref={hostRef} aria-hidden="true">
      <div
        className="payreq-sheet"
        ref={sheetRef}
        data-base={totals.base}
        data-gst={totals.gst}
        data-total={totals.total}
        data-gst-rate={totals.gstRate}
        data-gst-on={gstEnabled ? '1' : '0'}
      >
        <div className="payreq-top" />
        <div className="payreq-wrap">
          <div className="payreq-header">
            <div className="payreq-brand">
              <h1>DYZEN Solar Technologies</h1>
              <p>Powering a brighter tomorrow</p>
            </div>
            <div className="payreq-doc">
              <h2>PAYMENT REQUEST</h2>
              <p>{mode.docSubtitle}</p>
            </div>
          </div>

          <div className="payreq-rule" />

          <div className="payreq-intro">
            <div className="payreq-eyebrow">{eyebrowFor(client)}</div>
            <h2 className="payreq-title">{mode.mainTitle}</h2>
            <p className="payreq-sub">{mode.mainSub}</p>
          </div>

          <div className="payreq-hero">
            <div className="payreq-hero-label">{mode.heroLabel}</div>
            <div className="payreq-hero-amount" data-field="hero">{heroAmount}</div>
            <div className="payreq-hero-note">
              {note || mode.heroNote}
              {client?.name ? ` · ${client.name}` : ''}
            </div>
          </div>

          <div className="payreq-grid">
            <div className="payreq-card">
              <h3>Payment summary</h3>
              <div className="payreq-row">
                <span className="payreq-label">{mode.baseLabel}</span>
                <span className="payreq-value" data-field="base">{baseText}</span>
              </div>
              {gstEnabled ? (
                <div className="payreq-row">
                  <span className="payreq-label">GST @ {totals.gstRate}%</span>
                  <span className="payreq-value" data-field="gst">{gstText}</span>
                </div>
              ) : null}
              <div className="payreq-row">
                <span className="payreq-label">Invoice total</span>
                <span className="payreq-value" data-field="invoice">{totalText}</span>
              </div>
              <div className="payreq-total">
                <span>{mode.totalLabel}</span>
                <strong data-field="payable">{totalText}</strong>
              </div>
              <div className="payreq-row payreq-transfer">
                <span className="payreq-label">Amount for transfer</span>
                <span className="payreq-value" data-field="transfer">{totalText}</span>
              </div>
            </div>

            <div className="payreq-card payreq-qr-card">
              <h3>Scan &amp; pay via UPI</h3>
              <div className="payreq-qr-box">
                {payin.qrDataUrl
                  ? <img src={payin.qrDataUrl} alt="" crossOrigin="anonymous" />
                  : <span className="payreq-qr-placeholder">QR CODE</span>}
              </div>
              <div className="payreq-qr-caption">
                PhonePe • UPI transfer
                {payin.upiId ? <><br />{payin.upiId}</> : null}
              </div>
              <div className="payreq-upi" data-field="upi">Pay {totalText} via UPI</div>
            </div>
          </div>

          <div className="payreq-card payreq-bank">
            <h3>Bank transfer details</h3>
            <div className="payreq-row">
              <span className="payreq-label">Account holder</span>
              <span className="payreq-value">{payin.accountHolder || '—'}</span>
            </div>
            <div className="payreq-row">
              <span className="payreq-label">Bank</span>
              <span className="payreq-value">{payin.bankName || '—'}</span>
            </div>
            <div className="payreq-row">
              <span className="payreq-label">Account number</span>
              <span className="payreq-value">{payin.accountNumber || '—'}</span>
            </div>
            <div className="payreq-row">
              <span className="payreq-label">IFSC code</span>
              <span className="payreq-value">{payin.ifsc || '—'}</span>
            </div>
            <div className="payreq-row">
              <span className="payreq-label">Transfer amount</span>
              <span className="payreq-value" data-field="bank-transfer">{totalText}</span>
            </div>
          </div>

          <div className="payreq-footer">
            <div className="payreq-footer-left">
              <strong>DYZEN Solar Technologies</strong><br />
              This is a payment request, not a tax invoice.
            </div>
            <div className="payreq-thanks">Thank you for your business!</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentRequestModal({
  client = null,
  amount = 0,
  mode: initialMode = 'advance',
  note = '',
  onClose,
}) {
  const sheetRef = useRef(null)
  const hostRef = useRef(null)
  const [isGeneral, setIsGeneral] = useState(initialMode === 'general')
  const [baseAmount, setBaseAmount] = useState(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0 ? String(Math.round(n * 100) / 100) : ''
  })
  const [gstRate, setGstRate] = useState('18')
  const [gstEnabled, setGstEnabled] = useState(true)
  const [payin, setPayin] = useState(() => getPaymentRequestPayin())
  const [payinOpen, setPayinOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setPayin(getPaymentRequestPayin())
  }, [])

  const mode = isGeneral ? COPY.general : COPY.advance
  const totals = useMemo(
    () => paymentRequestTotals({ base: baseAmount, gstRate, gstEnabled }),
    [baseAmount, gstRate, gstEnabled]
  )

  function patchPayin(partial) {
    setPayin(prev => ({ ...prev, ...partial }))
  }

  function persistPayin() {
    const saved = savePaymentRequestPayin(payin)
    setPayin(saved)
    setSavedFlash(true)
    window.setTimeout(() => setSavedFlash(false), 1600)
  }

  async function onQrFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    try {
      const qrDataUrl = await fileToQrDataUrl(file)
      const next = { ...payin, qrDataUrl }
      setPayin(next)
      savePaymentRequestPayin(next)
    } catch (err) {
      setError(err.message || 'Could not use that QR image.')
    }
  }

  function clearQr() {
    const next = { ...payin, qrDataUrl: '' }
    setPayin(next)
    savePaymentRequestPayin(next)
  }

  async function downloadPdf() {
    if (!(totals.base > 0)) {
      setError('Enter a base amount greater than zero before downloading.')
      return
    }

    const sheet = sheetRef.current
    const host = hostRef.current
    if (!sheet || !host) return

    setBusy(true)
    setError(null)
    savePaymentRequestPayin(payin)

    // Briefly bring the capture sheet into a measurable viewport so html2canvas
    // sees live React text (amount/GST), not a broken off-screen snapshot.
    const prev = {
      opacity: host.style.opacity,
      left: host.style.left,
      top: host.style.top,
      zIndex: host.style.zIndex,
      pointerEvents: host.style.pointerEvents,
    }
    host.style.opacity = '0.01'
    host.style.left = '0'
    host.style.top = '0'
    host.style.zIndex = '1'
    host.style.pointerEvents = 'none'

    try {
      if (document.fonts?.ready) await document.fonts.ready
      await waitTwoFrames()

      const imgs = [...sheet.querySelectorAll('img')]
      await Promise.all(imgs.map(img => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve()
        return new Promise(resolve => {
          img.onload = resolve
          img.onerror = resolve
        })
      }))

      // Force current totals onto the sheet right before capture (belt + suspenders).
      const baseText = rupee(totals.base)
      const gstText = rupee(totals.gst)
      const totalText = rupee(totals.total)
      const heroAmount = gstEnabled
        ? `${baseText} + ${totals.gstRate}% GST`
        : `${baseText} (GST not applicable)`
      const setField = (name, text) => {
        sheet.querySelectorAll(`[data-field="${name}"]`).forEach(el => {
          el.textContent = text
        })
      }
      setField('hero', heroAmount)
      setField('base', baseText)
      setField('gst', gstText)
      setField('invoice', totalText)
      setField('payable', totalText)
      setField('transfer', totalText)
      setField('upi', `Pay ${totalText} via UPI`)
      setField('bank-transfer', totalText)
      await waitTwoFrames()

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])

      const canvas = await html2canvas(sheet, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        width: 794,
        height: 1123,
        windowWidth: 794,
        windowHeight: 1123,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        onclone: (_doc, cloned) => {
          const set = (name, text) => {
            cloned.querySelectorAll(`[data-field="${name}"]`).forEach(el => {
              el.textContent = text
            })
          }
          set('hero', heroAmount)
          set('base', baseText)
          set('gst', gstText)
          set('invoice', totalText)
          set('payable', totalText)
          set('transfer', totalText)
          set('upi', `Pay ${totalText} via UPI`)
          set('bank-transfer', totalText)
          cloned.style.width = '794px'
          cloned.style.height = '1123px'
        },
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      // Full-bleed A4 — same approach as dyzen_solar_payment_request_editable.html
      // (no margins / centering that leave empty bands top & bottom).
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight)

      const who = sanitizePdfName(client?.name || client?.company || 'Customer')
      const kind = isGeneral ? 'Payment_Request' : 'Advance_Payment_Request'
      pdf.save(`DYZEN_${kind}_${who}.pdf`)
    } catch (err) {
      console.error(err)
      setError('Could not generate PDF. Try again.')
    } finally {
      host.style.opacity = prev.opacity
      host.style.left = prev.left
      host.style.top = prev.top
      host.style.zIndex = prev.zIndex
      host.style.pointerEvents = prev.pointerEvents
      setBusy(false)
    }
  }

  const clientLine = client
    ? [client.name, client.company].filter(Boolean).join(' · ')
    : null

  return (
    <div className="modal-overlay payreq-overlay" onClick={onClose}>
      <div className="payreq-dialog" onClick={e => e.stopPropagation()}>
        <div className="payreq-dialog-head">
          <div>
            <h2>Payment request PDF</h2>
            <p>{clientLine || 'Enter an amount and download the request to send.'}</p>
          </div>
        </div>

        {error && <div className="login-error" style={{ marginBottom: 12 }}>{error}</div>}

        <section className="payreq-editors">
          <div className="payreq-editors-row">
            <div className="payreq-field">
              <span className="payreq-toggle-label">Payment type</span>
              <label className="payreq-switch">
                <input
                  type="checkbox"
                  checked={isGeneral}
                  onChange={e => setIsGeneral(e.target.checked)}
                />
                <span className="payreq-slider" />
              </label>
              <span className="payreq-chip mode">{mode.modeStatus}</span>
            </div>
          </div>
          <div className="payreq-divider" />
          <div className="payreq-editors-row">
            <div className="payreq-field">
              <label htmlFor="payreq-base">{mode.baseAmountLabel}</label>
              <input
                id="payreq-base"
                type="number"
                min="0"
                step="1"
                value={baseAmount}
                onChange={e => setBaseAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="payreq-field" style={{ flex: '0 0 88px', minWidth: 88 }}>
              <label htmlFor="payreq-gst-rate">GST %</label>
              <input
                id="payreq-gst-rate"
                className="gst"
                type="number"
                min="0"
                step="0.5"
                value={gstRate}
                disabled={!gstEnabled}
                onChange={e => setGstRate(e.target.value)}
              />
            </div>
            <div className="payreq-field" style={{ flex: '0 1 auto' }}>
              <span className="payreq-toggle-label">GST</span>
              <label className="payreq-switch">
                <input
                  type="checkbox"
                  checked={gstEnabled}
                  onChange={e => setGstEnabled(e.target.checked)}
                />
                <span className="payreq-slider" />
              </label>
              <span className={`payreq-chip ${gstEnabled ? 'on' : 'off'}`}>
                {gstEnabled ? 'ON' : 'OFF'}
              </span>
            </div>
          </div>

          <div className="payreq-live-total">
            <span>{mode.totalLabel}{gstEnabled ? ` (incl. ${totals.gstRate}% GST)` : ''}</span>
            <strong>{rupee(totals.total)}</strong>
          </div>
          <small className="payreq-hint">
            Enter the amount above — that exact figure goes into the PDF. Not a tax invoice.
          </small>

          <div className="payreq-divider" />
          <div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setPayinOpen(v => !v)}
            >
              {payinOpen ? 'Hide bank & QR' : 'Update bank details & QR'}
            </button>
            {savedFlash && (
              <span className="payreq-chip on" style={{ marginLeft: 10 }}>Saved on this device</span>
            )}
            {payinOpen && (
              <>
                <div className="payreq-payin-grid">
                  <div className="payreq-field">
                    <label>Account holder</label>
                    <input
                      value={payin.accountHolder}
                      onChange={e => patchPayin({ accountHolder: e.target.value })}
                    />
                  </div>
                  <div className="payreq-field">
                    <label>Bank</label>
                    <input
                      value={payin.bankName}
                      onChange={e => patchPayin({ bankName: e.target.value })}
                    />
                  </div>
                  <div className="payreq-field">
                    <label>Account number</label>
                    <input
                      value={payin.accountNumber}
                      onChange={e => patchPayin({ accountNumber: e.target.value })}
                    />
                  </div>
                  <div className="payreq-field">
                    <label>IFSC code</label>
                    <input
                      value={payin.ifsc}
                      onChange={e => patchPayin({ ifsc: e.target.value })}
                    />
                  </div>
                  <div className="payreq-field">
                    <label>UPI ID (optional)</label>
                    <input
                      value={payin.upiId}
                      onChange={e => patchPayin({ upiId: e.target.value })}
                      placeholder="name@upi"
                    />
                  </div>
                </div>
                <div className="payreq-qr-edit">
                  <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', margin: 0 }}>
                    {payin.qrDataUrl ? 'Replace QR image' : 'Upload QR image'}
                    <input type="file" accept="image/*" hidden onChange={onQrFile} />
                  </label>
                  {payin.qrDataUrl && (
                    <>
                      <img className="payreq-qr-thumb" src={payin.qrDataUrl} alt="QR preview" />
                      <button type="button" className="btn btn-secondary btn-sm" onClick={clearQr}>
                        Remove QR
                      </button>
                    </>
                  )}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button type="button" className="btn btn-primary btn-sm" onClick={persistPayin}>
                    Save bank & QR
                  </button>
                </div>
                <small className="payreq-hint">
                  Stored on this browser only. Upload the PhonePe / UPI QR you already use.
                </small>
              </>
            )}
          </div>
        </section>

        <div className="payreq-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="btn btn-primary" onClick={downloadPdf} disabled={busy}>
            {busy ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {createPortal(
        <PaymentRequestSheet
          sheetRef={sheetRef}
          hostRef={hostRef}
          client={client}
          mode={mode}
          note={note}
          totals={totals}
          gstEnabled={gstEnabled}
          payin={payin}
        />,
        document.body
      )}
    </div>
  )
}
