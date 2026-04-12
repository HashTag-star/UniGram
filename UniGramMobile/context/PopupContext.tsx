import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { PremiumPopup, PopupButton } from '../components/PremiumPopup';

interface PopupConfig {
  title?: string;
  message?: string;
  icon?: string;
  iconColor?: string;
  buttons?: PopupButton[];
}

interface PopupContextType {
  showPopup: (config: PopupConfig) => void;
  hidePopup: () => void;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export const PopupProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<PopupConfig>({});
  
  // To handle sequential popups (e.g. Delete -> Final Confirmation)
  const queue = useRef<PopupConfig[]>([]);

  const hidePopup = useCallback(() => {
    setVisible(false);
    // Check if there's another one in the queue
    if (queue.current.length > 0) {
      const next = queue.current.shift()!;
      setTimeout(() => {
        setConfig(next);
        setVisible(true);
      }, 300);
    }
  }, []);

  const showPopup = useCallback((newConfig: PopupConfig) => {
    if (visible) {
      queue.current.push(newConfig);
      hidePopup();
      return;
    }
    setConfig(newConfig);
    setVisible(true);
  }, [visible, hidePopup]);

  return (
    <PopupContext.Provider value={{ showPopup, hidePopup }}>
      {children}
      <PremiumPopup
        visible={visible}
        title={config.title}
        message={config.message}
        icon={config.icon}
        iconColor={config.iconColor}
        buttons={config.buttons || [{ text: 'OK', onPress: () => {} }]}
        onClose={hidePopup}
      />
    </PopupContext.Provider>
  );
};

export const usePopup = () => {
  const context = useContext(PopupContext);
  if (!context) throw new Error('usePopup must be used within a PopupProvider');
  return context;
};
