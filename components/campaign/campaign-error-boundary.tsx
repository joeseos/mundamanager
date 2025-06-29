"use client"

import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class CampaignErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center">
          <div className="container mx-auto max-w-4xl w-full space-y-4">
            <div className="bg-white shadow-md rounded-lg p-4">
              <h2 className="text-xl font-semibold text-red-500">Something went wrong.</h2>
              <p className="text-gray-600">Unable to load campaign data. Please try again later.</p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
} 