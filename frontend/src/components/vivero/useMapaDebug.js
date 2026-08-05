export default function useMapaDebug() {
  return (e) => {
    if (e.target.classList?.contains("zona-clickable")) return;

    const svg = e.currentTarget;
    const pt = svg.createSVGPoint();

    pt.x = e.clientX;
    pt.y = e.clientY;

    const cursor = pt.matrixTransform(svg.getScreenCTM().inverse());

    console.log(`x: ${Math.round(cursor.x)}, y: ${Math.round(cursor.y)}`);
  };
}