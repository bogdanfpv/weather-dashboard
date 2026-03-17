import { render, screen } from '@testing-library/react';
import NotificationPanel from '../src/components/NotificationPanel';

test('renders notification', () => {
    const notifications = [{ type: 'success', message: 'TestMessage', timestamp: 'TestTime'}];
    const clearNotifications = jest.fn();
    render(<NotificationPanel notifications={notifications} clearNotifications={clearNotifications}/>);
    expect(screen.getByText('TestMessage')).toBeInTheDocument();
});