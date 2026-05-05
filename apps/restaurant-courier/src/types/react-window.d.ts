// Minimal ambient declarations for react-window@1.8.x.
// The package does not ship .d.ts and @types/react-window@2 is a stub.
declare module 'react-window' {
  import { CSSProperties, ComponentType, ReactElement } from 'react';

  export interface ListChildComponentProps {
    index: number;
    style: CSSProperties;
    data?: unknown;
  }

  export interface FixedSizeListProps {
    height: number;
    itemCount: number;
    itemSize: number;
    width: number | string;
    children: ComponentType<ListChildComponentProps>;
    className?: string;
    style?: CSSProperties;
    itemData?: unknown;
    overscanCount?: number;
    layout?: 'horizontal' | 'vertical';
  }

  export class FixedSizeList extends React.Component<FixedSizeListProps> {}
}
