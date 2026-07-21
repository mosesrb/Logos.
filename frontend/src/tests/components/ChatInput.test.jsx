import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from '../../components/ChatInput';

describe('ChatInput', () => {
  it('renders correctly', () => {
    const setInput = vi.fn();
    render(<ChatInput input="" setInput={setInput} isStreaming={false} />);
    
    expect(screen.getByPlaceholderText(/Type your message/i)).toBeDefined();
  });

  it('calls setInput when typing', () => {
    const setInput = vi.fn();
    render(<ChatInput input="" setInput={setInput} isStreaming={false} />);
    
    const inputField = screen.getByPlaceholderText(/Type your message/i);
    fireEvent.change(inputField, { target: { value: 'Hello' } });
    
    expect(setInput).toHaveBeenCalledWith('Hello');
  });

  it('shows STOP button when streaming', () => {
    const setInput = vi.fn();
    const handleStopGeneration = vi.fn();
    
    render(<ChatInput input="" setInput={setInput} isStreaming={true} handleStopGeneration={handleStopGeneration} />);
    
    const stopButton = screen.getByRole('button', { name: /Stop Generation/i });
    expect(stopButton).toBeDefined();
    
    fireEvent.click(stopButton);
    expect(handleStopGeneration).toHaveBeenCalled();
  });

  it('disables input when streaming', () => {
    const setInput = vi.fn();
    render(<ChatInput input="" setInput={setInput} isStreaming={true} />);
    
    const inputField = screen.getByPlaceholderText(/Waiting for response/i);
    expect(inputField.disabled).toBe(true);
  });
});
