import { useContext, useEffect, useRef, type KeyboardEvent, type RefObject } from "react";
import { ModalActivityContext } from "./ModalActivityContext";

const selector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function useModalFocus(initialFocus: RefObject<HTMLElement | null>) {
  const modalRef = useRef<HTMLDivElement>(null);
  const setModalOpen = useContext(ModalActivityContext);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setModalOpen(true);
    initialFocus.current?.focus();
    return () => {
      setModalOpen(false);
      previous?.focus();
    };
  }, [initialFocus, setModalOpen]);

  function trapFocus(event: KeyboardEvent) {
    if (event.key !== "Tab") return;
    const elements = [...(modalRef.current?.querySelectorAll<HTMLElement>(selector) ?? [])]
      .filter((element) => element.offsetParent !== null || element === document.activeElement);
    if (elements.length === 0) return;
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return { modalRef, trapFocus };
}
