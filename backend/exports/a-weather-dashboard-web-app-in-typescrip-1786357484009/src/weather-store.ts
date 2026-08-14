export async function fetchWeatherData() {
  const response = await fetch('https://api.openweathermap.org/data/2.5/weather?q=London&appid=your_api_key');
  const data = await response.json();
  return {
    description: data.weather[0].description,
    temp: data.main.temp,
    humidity: data.main.humidity
  };
}