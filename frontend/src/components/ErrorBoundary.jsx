import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ error, errorInfo });
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-red-400 p-6 flex-col">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span role="img" aria-label="alert">⚠️</span>
            Application Error
          </h2>
          <p className="mb-6 text-gray-300 max-w-lg text-center">
            The LÓGOS UI encountered an unexpected error. Your chat session data should be safely preserved on the backend.
          </p>
          <div className="bg-black/50 p-4 rounded text-sm font-mono overflow-auto max-w-3xl w-full text-left mb-6">
            <p className="font-bold text-red-300">{this.state.error?.toString()}</p>
            <details className="mt-2 text-gray-500">
              <summary className="cursor-pointer hover:text-gray-400">View Component Stack</summary>
              <pre className="mt-2 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
            </details>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white hover:bg-red-500 rounded font-semibold transition-colors focus:ring-2 focus:ring-red-400 focus:outline-none"
            aria-label="Reload application"
          >
            Reload Interface
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
