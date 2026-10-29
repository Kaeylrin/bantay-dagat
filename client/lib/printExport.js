export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

export function printDocument(html) {
  const popup = window.open("", "_blank");
  if (!popup) {
    window.alert("Allow pop-ups for this site, then try the PDF export again.");
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  setTimeout(() => { if (!popup.closed) popup.print(); }, 400);
}
