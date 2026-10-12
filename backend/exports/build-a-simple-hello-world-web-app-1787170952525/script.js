// script.js

// Function to display the hello world message
function displayMessage() {
  const message = 'Hello, World!';
  const messageElement = document.createElement('p');
  messageElement.textContent = message;
  messageElement.style.color = '#22c55e';
  document.body.appendChild(messageElement);
}

// Call the function when the app loads
window.addEventListener('load', displayMessage);
