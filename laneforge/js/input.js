export const input = {
  keys: new Set(), pressed: new Set(),
  mx: 0, my: 0, down: false, rdown: false, clicked: false, rclicked: false,
  locked: false,
  init(canvas) {
    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (["Space", "Tab", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => { this.keys.clear(); this.down = false; this.rdown = false; });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.mx = e.clientX - r.left; this.my = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) { this.down = true; this.clicked = true; }
      if (e.button === 2) { this.rdown = true; this.rclicked = true; }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.down = false;
      if (e.button === 2) this.rdown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  },
  isDown(c) { return this.keys.has(c); },
  wasPressed(c) { return this.pressed.has(c); },
  endFrame() { this.pressed.clear(); this.clicked = false; this.rclicked = false; },
};
