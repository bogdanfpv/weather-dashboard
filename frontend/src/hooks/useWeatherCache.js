import { useState, useEffect } from "react";

export function useWeatherCache(location, setCachedWeatherData, setLastUpdated) {
    const [isLoading, setIsLoading] = useState(true);
    const [isDataReady, setIsDataReady] = useState(false);

    useEffect(() => {
        const locationToFetch = location;
        setIsLoading(true);
        setIsDataReady(false);

        const fetchCachedWeather = async () => {
            try {
                console.log("Fetching cached weather...");

                const response = await fetch(
                    `/api/get-cached-weather?t=${Date.now()}&location=${encodeURIComponent(locationToFetch)}`,
                    {
                        cache: "no-store",
                        headers: {
                            "Cache-Control": "no-cache, no-store, must-revalidate",
                            Pragma: "no-cache",
                        },
                    },
                );

                if (response.ok) {
                    const responseData = await response.json();
                    const { data, lastUpdated } = responseData;

                    if (data && data.current) {
                        setCachedWeatherData(data);
                        setLastUpdated(new Date(lastUpdated).toLocaleTimeString());
                        setIsDataReady(true);
                        console.log("Weather data set successfully");
                    }
                }
            } catch (error) {
                console.error("Failed to fetch cached weather data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchCachedWeather().catch(err => {
            console.error("Error fetching cached weather:", err);
            setIsLoading(false);
        });
    }, [location, setCachedWeatherData, setLastUpdated]);

    useEffect(() => {
        const locationToFetch = location;

        const interval = setInterval(
            async () => {
                try {
                    const response = await fetch(
                        `/api/get-cached-weather?t=${Date.now()}&location=${encodeURIComponent(locationToFetch)}`,
                        {
                            cache: "no-store",
                            headers: {
                                "Cache-Control": "no-cache, no-store, must-revalidate",
                                Pragma: "no-cache",
                            },
                        }
                    );
                    if (response.ok) {
                        const { data, lastUpdated } = await response.json();
                        if (data && data.current) {
                            setCachedWeatherData(data);
                            setLastUpdated(new Date(lastUpdated).toLocaleTimeString());
                            setIsDataReady(true);
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch cached weather data:", error);
                }
            },
            60 * 60 * 1000,
        );
        return () => clearInterval(interval);
    }, [location, setCachedWeatherData, setLastUpdated]);

    return {
        isLoading,
        isDataReady,
    };
}