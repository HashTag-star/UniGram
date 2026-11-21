import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import PagerView from 'react-native-pager-view';
import { PagerViewProps } from './PagerViewProps';

export interface PagerViewRef {
  setPage: (page: number) => void;
}

const PagerViewWrapper = forwardRef<PagerViewRef, PagerViewProps>(
  ({ children, style, initialPage, onPageSelected, scrollEnabled }, ref) => {
    const internalRef = useRef<any>(null);

    useImperativeHandle(ref, () => ({
      setPage: (page: number) => {
        internalRef.current?.setPage(page);
      },
    }));

    return (
      <PagerView
        ref={internalRef}
        style={style}
        initialPage={initialPage}
        onPageSelected={onPageSelected}
        scrollEnabled={scrollEnabled}
      >
        {children}
      </PagerView>
    );
  }
);

export default PagerViewWrapper;
