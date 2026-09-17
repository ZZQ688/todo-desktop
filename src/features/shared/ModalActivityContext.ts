import { createContext } from "react";

export const ModalActivityContext = createContext<(open: boolean) => void>(() => undefined);
