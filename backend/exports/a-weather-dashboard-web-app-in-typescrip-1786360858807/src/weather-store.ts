export const fetchWeatherData = async (): Promise<void> => {
  try {
    const data = await fetch('https://api.openweathermap.org/data/2.5/weather?q=London&appid=YOUR_API_KEY');
    const json = await data.json();
    displayWeatherData(json);
  } catch (error) {
    console.error('Failed to fetch weather data:', error);
  }
};

export const displayWeatherData = (data: { main: { temp: number; humidity: number } }) => {
  const element = document.getElementById('weatherInfo');
  if (element) element.textContent = `Temperature: ${data.main.temp}°C, Humidity: ${data.main.humidity}%`;
};