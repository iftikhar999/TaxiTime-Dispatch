declare module "point-in-polygon" {
  function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean;
  export default pointInPolygon;
}
