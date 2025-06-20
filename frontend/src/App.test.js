import { render, screen } from '@testing-library/react';
import Page from '../app/page';

test('renders weather app', () => {
  render(<Page />);

  // Check for main elements that should always be present
  expect(screen.getByText(/Paris, FR/i)).toBeInTheDocument();
  expect(screen.getByText("Today's Weather")).toBeInTheDocument();
  expect(screen.getByText('Next 5 Days')).toBeInTheDocument();
});