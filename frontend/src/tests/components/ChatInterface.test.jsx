import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatInterface from '../../components/ChatInterface';

describe('ChatInterface', () => {
  it('renders welcome screen when no session', () => {
    render(<ChatInterface currentSession={null} />);
    expect(screen.getByText(/Mainframe Corp/i)).toBeDefined();
    expect(screen.getByText(/AWAITING_NEURAL_UPLINK/i)).toBeDefined();
  });

  it('renders messages correctly', () => {
    const messages = [
      { role: 'user', content: 'Hello AI' },
      { role: 'assistant', content: 'Hello User' }
    ];
    const getMessageMeta = (m) => ({ css: m.role, label: m.role });
    
    render(<ChatInterface 
      currentSession={{ id: '123' }} 
      messages={messages} 
      getMessageMeta={getMessageMeta} 
    />);
    
    expect(screen.getByText(/Hello AI/i)).toBeDefined();
    expect(screen.getByText(/Hello User/i)).toBeDefined();
  });
});
