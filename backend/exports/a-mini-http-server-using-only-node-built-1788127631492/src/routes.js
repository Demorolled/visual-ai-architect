module.exports = {
  /**
   * This module handles the routing logic for the application.
   * It maps different URL paths to their respective responses.
   */
  routes: (req, res) => {
    const paths = [
      {
        path: '/',
        message: 'Welcome to the Home Page',
      },
      {
        path: '/about',
        message: 'About Us',
      },
      {
        path: '/contact',
        message: 'Contact Us',
      },
    ];

    const routeHandler = (path) => {
      const matched = paths.find(route => route.path === path);
      return matched ? matched.message : 'Not Found';
    };

    return {
      routeHandler,
    };
  };