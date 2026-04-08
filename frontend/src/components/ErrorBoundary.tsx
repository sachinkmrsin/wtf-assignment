import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-6 flex justify-center">
            <div className="max-w-sm w-full p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-center space-y-2">
              <p className="font-semibold text-destructive">Something went wrong</p>
              <p className="text-sm text-muted-foreground">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="text-xs text-teal-400 hover:underline mt-1"
              >
                Try again
              </button>
            </div>
          </div>
        )
      );
    }
    return this.props.children;
  }
}

