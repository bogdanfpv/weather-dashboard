import React from 'react';
import { render, screen } from '@testing-library/react';
import WeatherStats from './WeatherStats';

describe('WeatherStats', () => {
    const mockWeatherData = {
        current: {
            sunrise: '05:27',
            sunset: '20:57',
            visibility: '10km',
            humidity: '65%',
            pressure: '1013mb',
            uvIndex: '6'
        }
    };

    test('renders sun times', () => {
        render(<WeatherStats weatherData={mockWeatherData} />);
        expect(screen.getByText('Sunrise')).toBeInTheDocument();
        expect(screen.getByText('05:27')).toBeInTheDocument();
        expect(screen.getByText('Sunset')).toBeInTheDocument();
        expect(screen.getByText('20:57')).toBeInTheDocument();
    });

    test('renders weather details', () => {
        render(<WeatherStats weatherData={mockWeatherData} />);
        expect(screen.getByText('Visibility')).toBeInTheDocument();
        expect(screen.getByText('10km')).toBeInTheDocument();
        expect(screen.getByText('Humidity')).toBeInTheDocument();
        expect(screen.getByText('65%')).toBeInTheDocument();
    });
});