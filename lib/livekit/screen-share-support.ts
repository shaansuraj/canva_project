export type ScreenShareSupportInput = {
  hasMediaDevices: boolean;
  hasGetDisplayMedia: boolean;
  isSecureContext: boolean;
};

export type ScreenShareSupport = {
  supported: boolean;
  title: string;
  message: string;
};

export const DESKTOP_SCREEN_SHARE_MESSAGE =
  "This browser does not support web screen sharing. Present from desktop Chrome, Edge, or another browser with screen-capture support. This tablet can still view the live screen and use the annotation board.";

export function getScreenShareSupport(input: ScreenShareSupportInput): ScreenShareSupport {
  if (!input.isSecureContext) {
    return {
      supported: false,
      title: "Secure connection required",
      message: "Screen sharing requires HTTPS or localhost. Open the deployed HTTPS app before starting screen share."
    };
  }

  if (!input.hasMediaDevices || !input.hasGetDisplayMedia) {
    return {
      supported: false,
      title: "Screen sharing unavailable on this device",
      message: DESKTOP_SCREEN_SHARE_MESSAGE
    };
  }

  return {
    supported: true,
    title: "Screen sharing supported",
    message: "This browser supports screen sharing."
  };
}

export function getScreenShareErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/getDisplayMedia/i.test(message) || /not supported/i.test(message)) {
    return DESKTOP_SCREEN_SHARE_MESSAGE;
  }

  if (/permission|denied|notallowed/i.test(message)) {
    return "Screen sharing was blocked by the browser. Allow screen sharing in the browser prompt and try again.";
  }

  return message || "Screen sharing could not be started.";
}
