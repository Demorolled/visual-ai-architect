export interface ScreenshotResponse {
  success: boolean;
  image_base64?: string;
  error?: string;
  width?: number;
  height?: number;
  size_kb?: number;
  prompt?: string;
}

export interface VisionDescription {
  success: boolean;
  description: string;
  error?: string;
  model_used?: string;
}

export async function captureScreenshot(): Promise<ScreenshotResponse> {
  try {
    const res = await fetch('/api/system-monitor/screenshot', {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
    });
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      error: err?.name === 'AbortError'
        ? 'Screenshot capture timed out (20s)'
        : `Screenshot failed: ${err?.message || 'Unknown error'}`,
    };
  }
}

export async function captureAndDescribe(
  prompt?: string,
): Promise<VisionDescription> {
  const userPrompt = prompt || "What's shown on this screen? Describe the content briefly.";

  try {
    const res = await fetch('/api/system-monitor/screenshot/describe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: userPrompt }),
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        description: '',
        error: `Backend vision request failed: ${res.status} ${errText.substring(0, 200)}`,
      };
    }

    const data = await res.json();

    if (data.success && data.description) {
      return {
        success: true,
        description: data.description,
        model_used: data.model_used,
      };
    }

    return {
      success: false,
      description: '',
      error: data.error || 'Vision analysis failed',
    };
  } catch (err: any) {
    return {
      success: false,
      description: '',
      error: err?.name === 'AbortError'
        ? 'Vision analysis timed out (30s)'
        : `Vision analysis failed: ${err?.message || 'Unknown error'}`,
    };
  }
}
