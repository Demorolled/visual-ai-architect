package config

const (
	AppName                    = "3d-chess-app"
 PIECE_SCALE            float64 = 10.0
	CAMERA_START          struct {
		X      float64 = 0.0
		Y      float64 = 20.0
		Z      float64 = 5.0
		RotationAngle float64 = 0.7853981633974483 // M_PI / 4 radians (45 degrees)
	}
	LIGHTING_STATE         bool   = true
	LoggingLevel           string = "info"
)

func initializeConfig() {
	log.Println("Config initialized")
}

// Function to expose a typed export for external use.
// This is not required for the logic itself but can be used internally or by other modules.
func ExposedFunction() {
	log.Printf("%s function called", __func__)
}