/* Screen space, under a zoomed camera.
 *
 * The game is sized in DEVICE pixels and the main camera carries a zoom of
 * dpr, so a world unit is a CSS pixel (see main.js). That zoom does not spare
 * scrollFactor(0) objects: Phaser still scales them, about the camera's
 * origin, which is the middle of the frame. So an object laid out at CSS
 * point P lands at
 *
 *   originX + (P - originX) * zoom          in device pixels
 *
 * rather than at P * zoom where it belongs. At dpr 1 the two agree, which is
 * why nothing on a desktop ever showed it; at dpr 3 the minimap, the stick
 * and the gate arrow were all thrown off the edge of the phone.
 *
 * Solving for the P that lands in the right place gives P + originX * (1 -
 * 1/zoom): the same constant for every point, so it is a translation and
 * nothing else. Everything drawn in screen space is still laid out in CSS
 * pixels, exactly as before -- it is just placed relative to this.
 */
export function screenOrigin(scene) {
  const c = scene.cameras.main;
  return {
    x: c.width * c.originX * (1 - 1 / c.zoomX),
    y: c.height * c.originY * (1 - 1 / c.zoomY)
  };
}

/* Move a screen-space object's own origin onto the screen's. For anything
 * laid out in its LOCAL coordinates -- a Graphics drawn in CSS pixels, or a
 * full-screen image at 0,0. Guarded, so a frame where nothing moved does not
 * dirty the transform. */
export function pinToScreen(obj, o) {
  if (obj.x !== o.x || obj.y !== o.y) obj.setPosition(o.x, o.y);
  return obj;
}

/* A pointer, in the CSS pixels everything screen-side is laid out in.
 * pointer.x/y are GAME coordinates, which are device pixels now. */
export function cssPoint(scene, pt) {
  const s = scene.scale;
  return { x: pt.x * s.displaySize.width / s.width,
           y: pt.y * s.displaySize.height / s.height };
}
