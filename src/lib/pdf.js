// Renders each ".pdf-panel-item" inside `container` to a canvas and assembles
// them into a PDF, one page per panel sized to that panel's actual content height.
export async function downloadStoryPdf(container, filename) {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const items = container.querySelectorAll(".pdf-panel-item");

  // Capture all panels first at natural height
  const canvases = [];
  for (let i = 0; i < items.length; i++) {
    const canvas = await html2canvas(items[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#fdf6ee",
      logging: false,
    });
    canvases.push(canvas);
  }

  const ptWidth = 595.28; // A4 width in points
  const scale = ptWidth / canvases[0].width;
  const firstPageH = Math.ceil(canvases[0].height * scale);

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [ptWidth, firstPageH] });

  for (let i = 0; i < canvases.length; i++) {
    const pageH = Math.ceil(canvases[i].height * scale);
    if (i > 0) pdf.addPage([ptWidth, pageH]);
    const imgData = canvases[i].toDataURL("image/jpeg", 0.92);
    pdf.addImage(imgData, "JPEG", 0, 0, ptWidth, pageH);
  }

  pdf.save(filename);
}
