import React from 'react';
import { render, screen } from '@testing-library/react';
import WeatherApp from './WeatherApp';
import { act } from '@testing-library/react';

describe('WeatherApp', () => {
    test('renders weather app with main components', () => {
        render(<WeatherApp />);

        // Test header elements
        expect(screen.getByText(/Paris, FR/)).toBeInTheDocument();
        expect(screen.getByText('Monday 29 August')).toBeInTheDocument();

        // Test main temperature display (using a more specific selector)
        const mainTemp = screen.getByText(/21°/, { selector: '.text-6xl' });
        expect(mainTemp).toBeInTheDocument();
        expect(screen.getByText('Mostly sunny')).toBeInTheDocument();

        // Test forecast section heading
        expect(screen.getByText('Next 5 Days')).toBeInTheDocument();
    });

    test('displays the current time on mount', () => {
        render(<WeatherApp />);
        const timeText = screen.getByText(/Paris/);
        expect(timeText).toHaveTextContent(/•\s*\d{1,2}:\d{2}\s*(AM|PM)/);
    });

    test('displays current weather stats', () => {
        render(<WeatherApp />);

        // Test weather stats labels (using getAllByText to handle duplicates)
        expect(screen.getAllByText('High').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Low').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wind').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Rain').length).toBeGreaterThan(0);

        // Test weather values (using getAllByText to handle duplicates)
        expect(screen.getAllByText('23°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('14°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('7mph').length).toBeGreaterThan(0);
        expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
    });

    test('updates the time every 60 seconds', () => {
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-01-01T12:00:00'));

        render(<WeatherApp />);
        const timeText = screen.getByText(/Paris/);
        expect(timeText).toHaveTextContent('12:00');

        // Advance time
        act(() => {
            jest.advanceTimersByTime(60000);
        });

        // Re-query since the DOM may have updated
        expect(screen.getByText(/Paris/)).toHaveTextContent('12:01');

        jest.useRealTimers();
    });

    test('shows 5-day forecast data', () => {
        render(<WeatherApp />);

        // Test that forecast days are present (using getAllByText to handle duplicates)
        expect(screen.getAllByText('Tue').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Wed').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Thu').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Fri').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Sat').length).toBeGreaterThan(0);

        // Test some forecast temperatures (using getAllByText to handle duplicates)
        expect(screen.getAllByText('21°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('18°').length).toBeGreaterThan(0);
        expect(screen.getAllByText('15°').length).toBeGreaterThan(0);
    });

    test('renders hourly forecast on desktop view', () => {
        render(<WeatherApp />);

        // Test hourly forecast heading
        expect(screen.getByText("Today's Weather")).toBeInTheDocument();

        // Test some hourly times
        expect(screen.getByText('3am')).toBeInTheDocument();
        expect(screen.getByText('6am')).toBeInTheDocument();
        expect(screen.getByText('12pm')).toBeInTheDocument();
    });

    test('displays footer information', () => {
        render(<WeatherApp />);
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
    });
});