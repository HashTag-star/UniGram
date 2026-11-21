import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { PagerViewProps } from './PagerViewProps';

export interface PagerViewRef {
  setPage: (page: number) => void;
}

const PagerViewWrapper = forwardRef<PagerViewRef, PagerViewProps>(
  ({ children, style, initialPage = 0, onPageSelected }, ref) => {
    const [currentPage, setCurrentPage] = useState(initialPage);

    useImperativeHandle(ref, () => ({
      setPage: (page: number) => {
        setCurrentPage(page);
        if (onPageSelected) {
          onPageSelected({ nativeEvent: { position: page } } as any);
        }
      },
    }));

    const childrenArray = React.Children.toArray(children);

    return (
      <View style={[style, { overflow: 'hidden' }]}>
        {childrenArray.map((child, index) => {
          const isVisible = index === currentPage;
          return (
            <View
              key={index}
              style={{
                flex: 1,
                display: isVisible ? 'flex' : 'none',
              }}
            >
              {child}
            </View>
          );
        })}
      </View>
    );
  }
);

export default PagerViewWrapper;
