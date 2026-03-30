/* ========================================
   Simple Hash Router
   ======================================== */

class Router {
  constructor() {
    this.routes = {
      daily: [],
      weekly: [],
      monthly: [],
      yearly: []
    };
    this.currentRoute = null;
    this.onChange = null;

    // Listen for hash changes
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  /**
   * Register route handler
   * @param {string} route - daily|weekly|monthly|yearly
   * @param {Function} handler - callback function
   */
  on(route, handler) {
    if (this.routes[route]) {
      this.routes[route].push(handler);
    }
  }

  /**
   * Navigate to route
   * @param {string} route
   */
  navigate(route) {
    window.location.hash = route;
  }

  /**
   * Get current route name
   * @returns {string}
   */
  getCurrentRoute() {
    const hash = window.location.hash.slice(1) || 'daily';
    return hash.split('/')[0].split('?')[0];
  }

  /**
   * Get route params from hash
   * @returns {Object}
   */
  getParams() {
    const hash = window.location.hash.slice(1);
    const parts = hash.split('/');
    const params = {};

    if (parts[1]) params.date = parts[1];
    if (parts[2]) params.sub = parts[2];

    return params;
  }

  /**
   * Handle route change
   */
  handleRoute() {
    const route = this.getCurrentRoute();

    // Validate route
    if (!this.routes[route]) {
      this.navigate('daily');
      return;
    }

    this.currentRoute = route;
    const params = this.getParams();

    // Execute all handlers for this route
    for (const handler of this.routes[route]) {
      handler(params);
    }

    // Call global onChange if set
    if (this.onChange) {
      this.onChange(route, params);
    }
  }
}

// Singleton instance
const router = new Router();

export default router;
