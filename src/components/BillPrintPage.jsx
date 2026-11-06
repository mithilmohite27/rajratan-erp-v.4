import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function BillPrintPage({ children, pageCss, title }) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title
    return () => { document.title = previousTitle }
  }, [title])

  return createPortal(
    <div className="bill-print-page">
      <style>{`@media print { ${pageCss} }`}</style>
      {children}
    </div>,
    document.body
  )
}

