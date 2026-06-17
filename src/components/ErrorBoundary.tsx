import { Component, type ReactNode } from 'react'

interface Props {
  onRetry: () => void
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  retry = () => {
    this.setState({ hasError: false })
    try {
      this.props.onRetry()
    } catch {
      /* onRetry itself may throw — boundary will re-catch on next render */
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[56dvh] flex-col items-center justify-center gap-4">
          <p className="font-mono text-sm text-slate-400">页面加载异常</p>
          <button
            onClick={this.retry}
            className="rounded-full border border-neon-cyan/40 px-5 py-2 font-mono text-sm text-neon-cyan transition-colors hover:bg-neon-cyan/10"
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
