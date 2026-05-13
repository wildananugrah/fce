import { type ReactNode } from "react";
import { Modal as HeroModal } from "@heroui/react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ isOpen, onClose, title, children, size = "md" }: ModalProps) {
  return (
    <HeroModal>
      <HeroModal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <HeroModal.Container>
          <HeroModal.Dialog className={`w-full ${sizeClasses[size]} max-h-[85vh] overflow-y-auto`}>
            <HeroModal.Header>
              <HeroModal.Heading>{title}</HeroModal.Heading>
              <HeroModal.CloseTrigger />
            </HeroModal.Header>
            <HeroModal.Body>{children}</HeroModal.Body>
          </HeroModal.Dialog>
        </HeroModal.Container>
      </HeroModal.Backdrop>
    </HeroModal>
  );
}
