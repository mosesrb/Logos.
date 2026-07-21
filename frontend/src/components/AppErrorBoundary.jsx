import React from "react";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error("Application rendering failed", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-boundary" role="alert">
          <h1>Interface recovery needed</h1>
          <p>The interface encountered an unexpected rendering error. Your local data was not modified.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload interface
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
