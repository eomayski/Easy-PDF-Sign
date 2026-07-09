import { useRef, useState, useCallback, useEffect } from 'react';
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
// Touch: a long-press starts drawing; a plain swipe must stay free for page scrolling.
const LONG_PRESS_MS = 400;
const LONG_PRESS_MOVE_TOLERANCE = 10;

const isCoarsePointer =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

export function SignatureBox({ width, height, rect, onChange }: Props) {
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const longPressTimer = useRef<number | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  // Attach transformer to rect when rect is placed
  const attachTransformer = useCallback(() => {
    if (rectRef.current && trRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  }, []);

  useEffect(() => cancelLongPress, [cancelLongPress]);

  const beginDrawing = useCallback(
    (pos: { x: number; y: number }) => {
      setStartPos(pos);
      setDrawing(true);
      onChange({ x: pos.x, y: pos.y, width: 0, height: 0 });
    },
    [onChange],
  );

  const updateDrawing = useCallback(
    (pos: { x: number; y: number }) => {
      onChange({
        x: Math.min(startPos.x, pos.x),
        y: Math.min(startPos.y, pos.y),
        width: Math.abs(pos.x - startPos.x),
        height: Math.abs(pos.y - startPos.y),
      });
    },
    [startPos, onChange],
  );

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // If clicking on the rect itself, let the transformer handle it
      if (e.target !== e.target.getStage()) return;

      const stage = e.target.getStage();
      const pos = stage!.getPointerPosition()!;
      beginDrawing(pos);
    },
    [beginDrawing],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (!drawing) return;
      updateDrawing(e.target.getStage()!.getPointerPosition()!);
    },
    [drawing, updateDrawing],
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

  const handleTouchStart = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      // Touching the rect/transformer: Konva handles drag & resize itself
      if (e.target !== e.target.getStage()) return;
      cancelLongPress();
      if (e.evt.touches.length > 1) return; // pinch/two-finger — leave to the browser

      const pos = e.target.getStage()!.getPointerPosition();
      if (!pos) return;
      touchStartPos.current = pos;
      longPressTimer.current = window.setTimeout(() => {
        longPressTimer.current = null;
        navigator.vibrate?.(15);
        beginDrawing(pos);
      }, LONG_PRESS_MS);
    },
    [beginDrawing, cancelLongPress],
  );

  const handleTouchMove = useCallback(
    (e: Konva.KonvaEventObject<TouchEvent>) => {
      if (drawing) {
        e.evt.preventDefault(); // keep the page from scrolling while drawing
        const pos = e.target.getStage()!.getPointerPosition();
        if (pos) updateDrawing(pos);
        return;
      }
      // Finger moved before the long-press fired → it's a scroll, not a draw
      if (longPressTimer.current !== null && touchStartPos.current) {
        const pos = e.target.getStage()!.getPointerPosition();
        if (!pos) return;
        const moved = Math.hypot(pos.x - touchStartPos.current.x, pos.y - touchStartPos.current.y);
        if (moved > LONG_PRESS_MOVE_TOLERANCE) cancelLongPress();
      }
    },
    [drawing, updateDrawing, cancelLongPress],
  );

  const handleTouchEnd = useCallback(() => {
    cancelLongPress();
    if (drawing) handleMouseUp();
  }, [drawing, handleMouseUp, cancelLongPress]);

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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.evt.preventDefault()}
      style={{
        cursor: drawing ? 'crosshair' : 'default',
        touchAction: 'manipulation',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
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
              anchorSize={isCoarsePointer ? 16 : 10}
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
