 ```typescript
class CountdownEngine {
    private duration: number;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(duration: number) {
        this.duration = duration;
    }

    start() {
        if (this.intervalId !== null) return;

        const remainingTime = this.duration;
        let timeLeft = remainingTime;

        const tick = () => {
            if (timeLeft <= 0) {
                clearInterval(this.intervalId!);
                console.log('Countdown finished!');
                return;
            }

            document.getElementById('countdown')!.innerText = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
            timeLeft--;
        };

        this.intervalId = setInterval(tick, 1000);
    }

    stop() {
        if (this.intervalId === null) return;

        clearInterval(this.intervalId!);
        this.intervalId = null;
    }
}

const countdownEngine = new CountdownEngine(60 * 5); // 5 minutes

document.getElementById('start')!.addEventListener('click', () => {
    try {
        countdownEngine.start();
    } catch (error) {
        console.error('Error starting the countdown:', error);
    }
});

document.getElementById('stop')!.addEventListener('click', () => {
    try {
        countdownEngine.stop();
    } catch (error) {
        console.error('Error stopping the countdown:', error);
    }
});
``` ```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Countdown Timer</title>
    <style>
        #countdown {
            font-size: 2em;
            margin-top: 50px;
        }
        button {
            padding: 10px 20px;
            margin: 10px;
        }
    </style>
</head>
<body>
    <div id="countdown">00:00</div>
    <button id="start">Start</button>
    <button id="stop">Stop</button>

    <script>
        class CountdownEngine {
            private duration: number;
            private intervalId: NodeJS.Timeout | null = null;

            constructor(duration: number) {
                this.duration = duration;
            }

            start() {
                if (this.intervalId !== null) return;

                const remainingTime = this.duration;
                let timeLeft = remainingTime;

                const tick = () => {
                    if (timeLeft <= 0) {
                        clearInterval(this.intervalId!);
                        console.log('Countdown finished!');
                        return;
                    }

                    document.getElementById('countdown')!.innerText = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
                    timeLeft--;
                };

                this.intervalId = setInterval(tick, 1000);
            }

            stop() {
                if (this.intervalId === null) return;

                clearInterval(this.intervalId!);
                this.intervalId = null;
            }
        }

        const countdownEngine = new CountdownEngine(60 * 5); // 5 minutes

        document.getElementById('start')!.addEventListener('click', () => {
            try {
                countdownEngine.start();
            } catch (error) {
                console.error('Error starting the countdown:', error);
            }
        });

        document.getElementById('stop')!.addEventListener('click', () => {
            try {
                countdownEngine.stop();
            } catch (error) {
                console.error('Error stopping the countdown:', error);
            }
        });
    </script>
</body>
</html>
``` ```typescript
class CountdownEngine {
    private duration: number;
    private intervalId: NodeJS.Timeout | null = null;

    constructor(duration: number) {
        this.duration = duration;
    }

    start() {
        if (this.intervalId !== null) return;

        const remainingTime = this.duration;
        let timeLeft = remainingTime;

        const tick = () => {
            if (timeLeft <= 0) {
                clearInterval(this.intervalId!);
                console.log('Countdown finished!');
                return;
            }

            document.getElementById('countdown')!.innerText = `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`;
            timeLeft--;
        };

        this.intervalId = setInterval(tick, 1000);
    }

    stop() {
        if (this.intervalId === null) return;

        clearInterval(this.intervalId!);
        this.intervalId = null;
    }
}

const countdownEngine = new CountdownEngine(60 * 5); // 5 minutes

document.getElementById('start')!.addEventListener('click', () => {
    try {
        countdownEngine.start();
    } catch (error) {
        console.error('Error starting