import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <main className="empty-state"><img src="/assets/wordmark.png" alt="Madds" width="110" /><h1>Let’s try that again.</h1><p>This screen couldn’t open. Your account and creations haven’t been deleted.</p><a className="button primary" href="/">Back to Home</a></main> : this.props.children;
  }
}
