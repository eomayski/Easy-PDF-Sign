import { useRef, useState, useCallback } from 'react';
import { Stage, Layer, Rect, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { ViewportRect } from '../../types';

interface Props {
  width: number;
  height: number;
  rect: ViewportRect | null;
  onChange: (rect: ViewportRect) => void;
}

const MIN_SIZE = 60;

export function SignatureBox({ width, height, rect, onChange }: Props) {
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Attach transformer to rect when rect is placed
  const attachTransformer = useCallback(() => {
    if (rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // If clicking on the rect itself, let the transformer handle it
      if (e.target !== e.target.getStage()) return;

      const stage = e.target.getStage();
      const pos = stage!.getPointerPosition()!;
      setStartPos(pos);
      setDrawing(true);
      onChange({ x: pos.x, y: pos.y, width: 0, height: 0 });
    },
    [onChange],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!drawing) return;
      const pos = e.target.getStage()!.getPointerPosition()!;
      onChange({
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x),
        height: Math.abs(pos.y - startPos.y),
      });
    },
    [drawing, startPos, onChange],
  );

  const handleMouseUp = useCallback(() => {
    setDrawing(false);
    if (rect && rect.width < MIN_SIZE) {
      // Too small — clear it
      onChange({ x: 0, y: 0, width: 0, height: 0 });
    } else {
      attachTransformer();
    }
  }, [rect, onChange, attachTransformer]);

  const handleTransformEnd = useCallback(() => {
    const node = rectRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      x: node.x(),
      y: node.y(),
      width: Math.max(MIN_SIZE, node.width() * scaleX),
      height: Math.max(MIN_SIZE, node.height() * scaleY),
    });
  }, [onChange]);

  const handleDragEnd = useCallback(() => {
    const node = rectRef.current;
    if (!node) return;
    onChange({ x: node.x(), y: node.y(), width: node.width(), height: node.height() });
  }, [onChange]);

  const hasRect = rect && rect.width >= MIN_SIZE;

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{ cursor: drawing ? 'crosshair' : 'default' }}
    >
      <Layer>
        {hasRect && (
          <>
            <Rect
              ref={rectRef}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill="rgba(99,102,241,0.15)"
              stroke="#6366f1"
              strokeWidth={2}
              strokeDashArray={[6, 3]}
              draggable
              onDragEnd={handleDragEnd}
              onTransformEnd={handleTransformEnd}
              onMouseEnter={() => {
                const container = document.body;
                container.style.cursor = 'move';
              }}
              onMouseLeave={() => {
                const container = document.body;
                container.style.cursor = 'default';
              }}
            />
            <Transformer
              ref={trRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < MIN_SIZE || newBox.height < MIN_SIZE) return oldBox;
                return newBox;
              }}
              rotateEnabled={false}
            />
          </>
        )}
        {drawing && rect && rect.width > 0 && (
          <Rect
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            fill="rgba(99,102,241,0.1)"
            stroke="#6366f1"
            strokeWidth={1.5}
            strokeDashArray={[4, 2]}
          />
        )}
      </Layer>
    </Stage>
  );
}
