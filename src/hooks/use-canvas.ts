"use client"
import { downloadBlob, exportGeneratedUIAsPNG, generateFrameSnapShot } from "@/lib/frame-snapshot"
import { useGenerateWorkflowMutation } from "@/redux/api/generation"
import { addErrorMessage, addUserMessage, clearChat, finishStreamingResponse, initializeChat, startStreamResponse, updateStreamingContent } from "@/redux/slice/chat"
import { addArrow, addEllipse, addFrame, addFreeDrawShape, addGeneratedUI, addLine, addRect, addText, clearSelection, FrameShape, removeShape, selectShape, setTool, Shape, Tool, updateShape } from "@/redux/slice/shapes"
import { handToolDisable, handToolEnable, panEnd, panMove, panStart, Point, screenToWorld, wheelPan, wheelZoom } from "@/redux/slice/viewport"
import { AppDispatch, useAppDispatch, useAppSelector } from "@/redux/store"
import { nanoid } from "@reduxjs/toolkit"
import { useCallback, useEffect, useRef, useState } from "react"
import { useDispatch } from "react-redux"
import { toast } from "sonner"
interface ToucPointer {
    ide: number
    p: Point
}

interface DraftShape {
    type: 'frame' | 'rect' | 'ellipse' | 'arrow' | 'line'
    startWorld: Point
    currentWorld: Point
}
const RAF_INTERVAL_MS = 8

export const useInfiniteCanvas = () => {
    const dispatch = useDispatch<AppDispatch>()
    const viewport = useAppSelector((s) => s.viewport)
    const entityState = useAppSelector((s) => s.shapes.shapes)
    const shapeList: Shape[] = entityState.ids.map((id: string) => entityState.entities[id])
        .filter((s: Shape | undefined): s is Shape => Boolean(s))
    const currentTool = useAppSelector((s) => s.shapes.tool); // Fixed: was currentTool, should be tool

    const selectedShapes = useAppSelector((s) => s.shapes.selected)
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const shapesEntities = useAppSelector((s) => s.shapes.shapes.entities)
    const hasSelectedText = Object.keys(selectedShapes).some((id) => {
        const shape = shapesEntities[id]
        return shape?.type === 'text'
    })
    useEffect(() => {
        if (hasSelectedText && !isSidebarOpen) {
            setIsSidebarOpen(true)
        }
        else if (!hasSelectedText) {
            setIsSidebarOpen(false)
        }

    }, [hasSelectedText, isSidebarOpen])
    const canvasRef = useRef<HTMLDivElement | null>(null)
    const touchMapref = useRef<Map<number, ToucPointer>>(new Map())


    const draftShapeRef = useRef<DraftShape | null>(null)
    const freeDrawPointsRef = useRef<Point[]>([])
    const isSpacePresed = useRef(false)
    const isDrawingref = useRef(false)
    const isMovingref = useRef(false)
    const moveStartRef = useRef<Point | null>(null)
    const initialShapePositionsRef = useRef<
        Record<
            string, {
                x?: number
                y?: number
                points?: Point[]
                startX?: number
                startY?: number
                endX?: number
                endY?: number
            }
        >>({})
    const isErasingRef = useRef(false)
    const erasedShapesRef = useRef<Set<string>>(new Set())
    const isResizingRef = useRef(false)
    const resizeDataRef = useRef<{
        shapeId: string
        corner: string
        initialBounds: { x: number; y: number; w: number; h: number }
        startPoint: { x: number; y: number }
    } | null>(null)


    const lastFreeHandFrameRef = useRef(0)
    const freeHandRafRef = useRef<number | null>(null)
    const panRafRef = useRef<number | null>(null)
    const pendingPanPointRef = useRef<Point | null>(null)

    const [, force] = useState(0)
    const requestRender = (): void => {
        force((n) => (n + 1) | 0)
    }

    const localPointFromClient = (clientX: number, clientY: number): Point => {
        const el = canvasRef.current
        if (!el) return { x: clientX, y: clientY }
        const r = el.getBoundingClientRect()
        return { x: clientX - r.left, y: clientY - r.top }
    }


    const blurActiveTextInput = () => {
        const activeElement = document.activeElement
        if (activeElement && activeElement.tagName === 'INPUT') {
            ; (activeElement as HTMLInputElement).blur()
        }
    }

    type WithClientXY = { clientX: number; clientY: number }
    const getLocalPointFromPtr = (e: WithClientXY): Point => localPointFromClient(e.clientX, e.clientY)

    const getShapeAtPoint = (worldPoint: Point): Shape | null => {
        console.log('🔍 Searching for shape at:', worldPoint, 'Total shapes:', shapeList.length)
        for (let i = shapeList.length - 1; i >= 0; i--) {
            const shape = shapeList[i]
            const isHit = isPointInShape(worldPoint, shape)
            const bounds = 'x' in shape && 'w' in shape && 'h' in shape
                ? { x: shape.x, y: shape.y, w: shape.w, h: shape.h }
                : ('startX' in shape ? { startX: shape.startX, startY: shape.startY, endX: shape.endX, endY: shape.endY } : 'Other')
            console.log(`  Checking shape ${i}:`, {
                id: shape.id,
                type: shape.type,
                bounds,
                isHit
            })
            if (isHit) {
                console.log('✅ Found shape:', shape.id)
                return shape
            }
        }
        console.log('❌ No shape found at point')
        return null

    }

    const isPointInShape = (point: Point, shape: Shape): boolean => {
        switch (shape.type) {
            case 'rect':
            case 'frame':
            case 'ellipse':
            case 'generatedui':
                return (
                    point.x >= shape.x &&
                    point.x <= shape.x + shape.w &&
                    point.y >= shape.y &&
                    point.y <= shape.y + shape.h
                )
            case 'freedraw':
                const threshold = 5
                for (let i = 0; i < shape.points.length - 1; i++) {
                    const p1 = shape.points[i]
                    const p2 = shape.points[i + 1]
                    if (distanceToLineSegment(point, p1, p2) <= threshold) {
                        return true
                    }
                }
                return false
            case 'line':
                const lineThreshold = 8
                return (
                    distanceToLineSegment(
                        point,
                        { x: shape.startX, y: shape.startY },
                        { x: shape.endX, y: shape.endY }
                    ) <= lineThreshold
                )
            case 'text':
                const textWidth = Math.max(
                    shape.text.length * (shape.fontSize * 0.6), 100
                )
                const textHeight = shape.fontSize * 1.2
                const padding = 8

                return (
                    point.x >= shape.x - 2 &&
                    point.x <= shape.x + textWidth + padding + 2 &&
                    point.y >= shape.y - 2 &&
                    point.y <= shape.y + textHeight + padding + 2
                )

            case 'arrow':
                // Arrow is similar to line - check distance from start to end
                const arrowThreshold = 10
                return (
                    distanceToLineSegment(
                        point,
                        { x: shape.startX, y: shape.startY },
                        { x: shape.endX, y: shape.endY }
                    ) <= arrowThreshold
                )
            default:
                return false
        }



    }

    const distanceToLineSegment = (
        point: Point,
        lineStart: Point,
        lineEnd: Point,
    ): number => {


        const A = point.x - lineStart.x
        const B = point.y - lineStart.y
        const C = lineEnd.x - lineStart.x
        const D = lineEnd.y - lineStart.y

        const dot = A * C + B * D
        const lenSq = C * C + D * D
        let param = -1
        if (lenSq !== 0) {
            param = dot / lenSq
        }

        let xx, yy

        if (param < 0) {
            xx = lineStart.x
            yy = lineStart.y
        } else if (param > 1) {
            xx = lineEnd.x
            yy = lineEnd.y
        } else {
            xx = lineStart.x + param * C
            yy = lineStart.y + param * D
        }

        const dx = point.x - xx
        const dy = point.y - yy
        return Math.sqrt(dx * dx + dy * dy)
    }

    const schedulePanMove = (p: Point) => {
        pendingPanPointRef.current = p
        if (panRafRef.current !== null) {
            panRafRef.current = window.requestAnimationFrame(() => {
                panRafRef.current = null
                const next = pendingPanPointRef.current
                if (next) dispatch(panMove(next))
            })
        }

    }

    const freeHandTick = (): void => {
        const now = performance.now()
        if (now - lastFreeHandFrameRef.current >= RAF_INTERVAL_MS) {
            if (freeDrawPointsRef.current.length > 0) requestRender()
            lastFreeHandFrameRef.current = now

        }
        if (isDrawingref.current) {
            freeHandRafRef.current = window.requestAnimationFrame(freeHandTick)
        }
    }



    const onWheel = useCallback((e: WheelEvent) => {
        e.preventDefault()
        e.stopPropagation()
        console.log('🎡 Wheel event triggered!', { ctrlKey: e.ctrlKey, metaKey: e.metaKey, deltaY: e.deltaY })

        // Get element directly from event target
        const el = e.currentTarget as HTMLElement
        const r = el.getBoundingClientRect()
        const originScreen = { x: e.clientX - r.left, y: e.clientY - r.top }

        if (e.ctrlKey || e.metaKey) {
            console.log('🔍 Zooming with wheel:', { deltaY: e.deltaY })
            dispatch(wheelZoom({ deltaY: e.deltaY, originScreen }))
        }
        else {
            const dx = e.shiftKey ? e.deltaY : e.deltaX
            const dy = e.shiftKey ? 0 : e.deltaY
            console.log('📜 Panning:', { dx, dy })
            dispatch(wheelPan({ dx, dy }))
        }
    }, [dispatch])


    const onPointerDown: React.PointerEventHandler<HTMLDivElement> = (e) => {
        console.log('🚀 onPointerDown CALLED!', e.type, e.button)
        const target = e.target as HTMLElement
        const isButton =
            target.tagName === "BUTTON" ||
            target.closest("button") ||
            target.classList.contains("pointer-events-auto") ||
            target.closest(".pointer-events-auto")
        if (!isButton) {
            e.preventDefault()
        }
        else {
            console.log('Not Preventing Default - clicked on interactive element: ', target)
            return
        }
        const local = getLocalPointFromPtr(e.nativeEvent)
        const world = screenToWorld(local, viewport.translate, viewport.scale)

        console.log('🖱️ Pointer Down:', {
            button: e.button,
            currentTool,
            local,
            world,
            viewport: { translate: viewport.translate, scale: viewport.scale },
            shapeCount: shapeList.length,
            shapes: shapeList.map(s => ({ id: s.id, type: s.type, x: 'x' in s ? s.x : 'N/A', y: 'y' in s ? s.y : 'N/A' }))
        })

        if (touchMapref.current.size <= 1) {
            canvasRef.current?.setPointerCapture(e.pointerId)
            const isPanButton = (e.button === 1) || e.button === 2
            const panByShift = isSpacePresed.current && e.button === 0
            if (isPanButton || panByShift) {
                const mode = isSpacePresed.current ? 'shiftPanning' : 'panning'
                dispatch(panStart({ screen: local, mode }))
                return
            }
            if (e.button === 0) {
                // You need to define how to get the current tool; here's an example using a state or selector:
                if (currentTool === 'select') {
                    const hitShape = getShapeAtPoint(world)
                    console.log('🎯 Select Mode - Looking for shape at:', world, 'Found:', hitShape)
                    if (hitShape) {
                        const isAlreadySelected = selectedShapes[hitShape.id]
                        console.log('✅ Shape hit:', hitShape.id, 'Type:', hitShape.type, 'Already selected:', isAlreadySelected)
                        if (!isAlreadySelected) {
                            if (!e.shiftKey) dispatch(clearSelection())
                            dispatch(selectShape(hitShape.id))
                        }
                        isMovingref.current = true
                        moveStartRef.current = world

                        initialShapePositionsRef.current = {}
                        Object.keys(selectedShapes).forEach((id) => {
                            const shape = shapesEntities[id]
                            if (shape) {
                                if (
                                    shape.type === 'frame' ||
                                    shape.type === 'rect' ||
                                    shape.type === 'ellipse' ||
                                    shape.type === 'generatedui'
                                ) {
                                    initialShapePositionsRef.current[id] = {
                                        x: shape.x,
                                        y: shape.y
                                    }
                                }
                                else if (shape.type === 'freedraw') {
                                    initialShapePositionsRef.current[id] = {
                                        points: [...shape.points]
                                    }
                                }
                                else if (shape.type === 'line' || shape.type === 'arrow') {
                                    initialShapePositionsRef.current[id] = {
                                        startX: shape.startX,
                                        startY: shape.startY,
                                        endX: shape.endX,
                                        endY: shape.endY
                                    }
                                }
                                else if (shape.type === 'text') {
                                    initialShapePositionsRef.current[id] = {
                                        x: shape.x,
                                        y: shape.y
                                    }
                                }
                            }
                        })

                        if (
                            hitShape.type === 'frame' ||
                            hitShape.type === 'rect' ||
                            hitShape.type === 'ellipse' ||
                            hitShape.type === 'generatedui'
                        ) {
                            initialShapePositionsRef.current[hitShape.id] = {
                                x: hitShape.x,
                                y: hitShape.y
                            }
                        }
                        else if (hitShape.type === 'freedraw') {
                            initialShapePositionsRef.current[hitShape.id] = {
                                points: [...hitShape.points]
                            }
                        }
                        else if (hitShape.type === 'line' || hitShape.type === 'arrow') {
                            initialShapePositionsRef.current[hitShape.id] = {
                                startX: hitShape.startX,
                                startY: hitShape.startY,
                                endX: hitShape.endX,
                                endY: hitShape.endY
                            }
                        }
                        else if (hitShape.type === 'text') {
                            initialShapePositionsRef.current[hitShape.id] = {
                                x: hitShape.x,
                                y: hitShape.y
                            }

                        }

                    }
                    else {
                        console.log('❌ No shape found at world position:', world)
                        if (!e.shiftKey) {
                            dispatch(clearSelection())
                            blurActiveTextInput()
                        }
                    }
                }
                else if (currentTool === 'eraser') {
                    isErasingRef.current = true
                    erasedShapesRef.current.clear()
                    const hitShape = getShapeAtPoint(world)
                    if (hitShape) {
                        dispatch(removeShape(hitShape.id))
                        erasedShapesRef.current.add(hitShape.id)
                    }
                    else {
                        blurActiveTextInput()

                    }
                }
                else if (currentTool === 'text') {
                    dispatch(addText({ x: world.x, y: world.y }))
                    dispatch(setTool('select'))
                }
                else {
                    console.log('🎨 Drawing mode:', currentTool, 'at world:', world)
                    isDrawingref.current = true
                    if (
                        currentTool === 'frame' ||
                        currentTool === 'rect' ||
                        currentTool === 'ellipse' ||
                        currentTool === 'arrow' ||
                        currentTool === 'line'
                    ) {
                        console.log('📝 Starting draft for:', currentTool)
                        draftShapeRef.current = {
                            type: currentTool,
                            startWorld: world,
                            currentWorld: world
                        }
                        requestRender()
                    }
                    else if (currentTool === 'freedraw') {
                        console.log('✏️ Starting freedraw')
                        freeDrawPointsRef.current = [world]
                        lastFreeHandFrameRef.current = performance.now()
                        freeHandRafRef.current = window.requestAnimationFrame(freeHandTick)
                        requestRender()
                    }


                }

            }

        }

    }

    const onPointerMove: React.PointerEventHandler<HTMLDivElement> = (e) => {
        const local = getLocalPointFromPtr(e.nativeEvent)
        const world = screenToWorld(local, viewport.translate, viewport.scale)

        if (viewport.mode === 'panning' || viewport.mode === 'shiftPanning') {
            schedulePanMove(local)
            return
        }
        if (isErasingRef.current && currentTool === 'eraser') {
            const hitShape = getShapeAtPoint(world)
            if (hitShape && !erasedShapesRef.current.has(hitShape.id)) {
                dispatch(removeShape(hitShape.id))
                erasedShapesRef.current.add(hitShape.id)
            }

        }

        if (
            isMovingref.current &&
            moveStartRef.current &&
            currentTool === 'select'
        ) {
            const deltaX = world.x - moveStartRef.current.x
            const deltaY = world.y - moveStartRef.current.y


            Object.keys(initialShapePositionsRef.current).forEach((id) => {
                const initial = initialShapePositionsRef.current[id]
                const shape = entityState.entities[id]
                if (shape && initial) {
                    if (
                        shape.type === 'frame' ||
                        shape.type === 'rect' ||
                        shape.type === 'ellipse' ||
                        shape.type === 'generatedui' ||
                        shape.type === 'text'

                    ) {
                        if (typeof initial.x === 'number' && typeof initial.y === 'number') {
                            dispatch(
                                updateShape({
                                    id,
                                    patch: {
                                        x: initial.x + deltaX,
                                        y: initial.y + deltaY
                                    },
                                })
                            )

                        }

                    }
                    else if (shape.type === 'freedraw') {
                        const initialPoints = initial.points
                        if (initialPoints) {
                            const newPoints = initialPoints.map((pt) => ({
                                x: pt.x + deltaX,
                                y: pt.y + deltaY
                            }))
                            dispatch(
                                updateShape({
                                    id,
                                    patch: {
                                        points: newPoints

                                    },
                                })
                            )

                        }

                    }
                    else if (shape.type === 'line' || shape.type === 'arrow') {
                        if (
                            typeof initial.startX === 'number' &&
                            typeof initial.startY === 'number' &&
                            typeof initial.endX === 'number' &&
                            typeof initial.endY === 'number'
                        ) {
                            dispatch(
                                updateShape({
                                    id,
                                    patch: {
                                        startX: initial.startX + deltaX,
                                        startY: initial.startY + deltaY,
                                        endX: initial.endX + deltaX,
                                        endY: initial.endY + deltaY
                                    }
                                })

                            )
                        }
                    }
                }

            })
        }



        if (isDrawingref.current) {
            if (draftShapeRef.current) {
                draftShapeRef.current.currentWorld = world
                requestRender()
            }
            else if (currentTool === 'freedraw') {
                freeDrawPointsRef.current.push(world)
            }
        }




    }



    const finalizeDrawingIfAny = (): void => {
        if (!isDrawingref.current) return
        console.log('🏁 Finalizing drawing...')
        isDrawingref.current = false
        if (freeHandRafRef.current) {
            window.cancelAnimationFrame(freeHandRafRef.current)
            freeHandRafRef.current = null
        }
        const draft = draftShapeRef.current
        if (draft) {
            const x = Math.min(draft.startWorld.x, draft.currentWorld.x)
            const y = Math.min(draft.startWorld.y, draft.currentWorld.y)
            const w = Math.abs(draft.currentWorld.x - draft.startWorld.x)
            const h = Math.abs(draft.currentWorld.y - draft.startWorld.y)

            console.log('📐 Draft dimensions:', { type: draft.type, x, y, w, h, start: draft.startWorld, current: draft.currentWorld })

            if (w > 1 && h > 1) {
                if (draft.type === 'frame') {
                    console.log('✅ Adding frame shape:', { x, y, w, h })
                    dispatch(addFrame({ x, y, w, h }))
                } else if (draft.type === 'rect') {
                    console.log('✅ Adding rect shape:', { x, y, w, h })
                    dispatch(addRect({ x, y, w, h }))
                }
                else if (draft.type === 'ellipse') {
                    console.log('✅ Adding ellipse shape:', { x, y, w, h })
                    dispatch(addEllipse({ x, y, w, h }))
                } else if (draft.type === 'arrow') {
                    console.log('✅ Adding arrow shape')
                    dispatch(
                        addArrow({
                            startX: draft.startWorld.x,
                            startY: draft.startWorld.y,
                            endX: draft.currentWorld.x,
                            endY: draft.currentWorld.y
                        })
                    )
                } else if (draft.type === 'line') {
                    console.log('✅ Adding line shape')
                    dispatch(
                        addLine({
                            startX: draft.startWorld.x,
                            startY: draft.startWorld.y,
                            endX: draft.currentWorld.x,
                            endY: draft.currentWorld.y
                        })
                    )

                }

            } else {
                console.log('⚠️ Shape too small to add:', { w, h }, 'minimum: 1x1')
            }
            draftShapeRef.current = null





        } else if (currentTool === 'freedraw') {
            const points = freeDrawPointsRef.current
            console.log('✏️ Finalizing freedraw:', points.length, 'points')
            if (points.length > 1) dispatch(addFreeDrawShape({ points: points }))
            freeDrawPointsRef.current = []

        }
        requestRender()


    }


    const onPointerUp: React.PointerEventHandler<HTMLDivElement> = (e) => {
        canvasRef.current?.releasePointerCapture(e.pointerId)
        if (viewport.mode === 'panning' || viewport.mode === 'shiftPanning') {
            dispatch(panEnd())

        }
        if (isMovingref.current) {
            isMovingref.current = false
            moveStartRef.current = null
            initialShapePositionsRef.current = {}
        }
        if (isErasingRef.current) {
            isErasingRef.current = false
            erasedShapesRef.current.clear()
        }
        finalizeDrawingIfAny()




    }
    const onPointerCancel: React.PointerEventHandler<HTMLDivElement> = (e) => {
        onPointerUp(e)
    }

    const onKeyDown = (e: KeyboardEvent): void => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' && !e.repeat) {
            e.preventDefault()
            isSpacePresed.current = true
            dispatch(handToolEnable())
        }
    }



    const onKeyUp = (e: KeyboardEvent): void => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
            e.preventDefault()
            isSpacePresed.current = false
            dispatch(handToolDisable())
        }
    }

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown)
        document.addEventListener('keyup', onKeyUp)
        return () => {
            document.removeEventListener('keydown', onKeyDown)
            document.removeEventListener('keyup', onKeyUp)
            if (freeHandRafRef.current) {
                window.cancelAnimationFrame(freeHandRafRef.current)
            }
            if (panRafRef.current) window.cancelAnimationFrame(panRafRef.current)
        }

    }, [])

    useEffect(() => {
        const handleResizeStart = (e: CustomEvent) => {
            const { shapeId, corner, bounds } = e.detail
            isResizingRef.current = true
            resizeDataRef.current = {
                shapeId,
                corner,
                initialBounds: bounds,
                startPoint: { x: e.detail.clientX || 0, y: e.detail.clientY || 0 }
            }
        }
        const handleResizeMove = (e: CustomEvent) => {
            if (!isResizingRef.current || !resizeDataRef.current) return
            const { shapeId, corner, initialBounds } = resizeDataRef.current
            const { clientX, clientY } = e.detail
            const canvasEl = canvasRef.current
            if (!canvasEl) return

            const rect = canvasEl.getBoundingClientRect()
            const localX = clientX - rect.left
            const localY = clientY - rect.top

            const world = screenToWorld(
                { x: localX, y: localY },
                viewport.translate,
                viewport.scale
            )
            const shape = entityState.entities[shapeId]
            if (!shape) return
            const newBounds = { ...initialBounds }

            switch (corner) {

                case 'nw':
                    newBounds.w = Math.max(
                        10,
                        initialBounds.w + (initialBounds.x - world.x)
                    )
                    newBounds.h = Math.max(
                        10,
                        initialBounds.h + (initialBounds.y - world.y)
                    )

                    newBounds.x = world.x
                    newBounds.y = world.y
                    break

                case 'ne':
                    newBounds.w = Math.max(10, world.x - initialBounds.x)
                    newBounds.h = Math.max(
                        10,
                        initialBounds.h + (initialBounds.y - world.y)
                    )
                    newBounds.y = world.y
                    break
                case 'sw':
                    newBounds.w = Math.max(10, initialBounds.w + (initialBounds.x - world.x))
                    newBounds.h = Math.max(10, world.y - initialBounds.y)
                    newBounds.x = world.x
                    break

                case 'se':
                    newBounds.w = Math.max(10, world.x - initialBounds.x)
                    newBounds.h = Math.max(10, world.y - initialBounds.y)
                    break
            }
            if (
                shape.type === 'frame' ||
                shape.type === 'rect' ||
                shape.type === 'ellipse'

            ) {
                dispatch(updateShape({
                    id: shapeId,
                    patch: {
                        x: newBounds.x,
                        y: newBounds.y,
                        w: newBounds.w,
                        h: newBounds.h

                    }
                }))
            }
            else if (shape.type === 'freedraw') {
                const xs = shape.points.map((p: { x: number, y: number }) => p.x)
                const ys = shape.points.map((p: { x: number, y: number }) => p.y)
                const actualMinx = Math.min(...xs)
                const actualMiny = Math.min(...ys)
                const actualMaxx = Math.max(...xs)
                const actualMaxy = Math.max(...ys)

                const actualWidth = actualMaxx - actualMinx
                const actualHeight = actualMaxy - actualMiny

                const newActualX = newBounds.x + 5
                const newActualY = newBounds.y + 5
                const newActualW = Math.max(10, newBounds.w - 10)
                const newActualH = Math.max(10, newBounds.h - 10)

                const scaleX = actualWidth > 0 ? newActualW / actualWidth : 1
                const scaleY = actualHeight > 0 ? newActualH / actualHeight : 1

                const scaledPoints = shape.points.map(
                    (point: { x: number; y: number }) => ({
                        x: newActualX + (point.x - actualMinx) * scaleX,
                        y: newActualY + (point.y - actualMiny) * scaleY
                    })
                )
                dispatch(updateShape({
                    id: shapeId,
                    patch: {
                        points: scaledPoints

                    },
                })
                )

            }
            else if (shape.type === 'line' || shape.type === 'arrow') {
                const actualMinX = Math.min(shape.startX, shape.endX)
                const actualMaxX = Math.max(shape.startX, shape.endX)
                const actualMinY = Math.min(shape.startY, shape.endY)
                const actualMaxY = Math.max(shape.startY, shape.endY)
                const actualWidth = actualMaxX - actualMinX
                const actualHeight = actualMaxY - actualMinY

                const newActualX = newBounds.x + 5
                const newActualY = newBounds.y + 5
                const newActualW = Math.max(10, newBounds.w - 10)
                const newActualH = Math.max(10, newBounds.h - 10)

                let newStartX, newStartY, newEndX, newEndY
                if (actualWidth === 0) {
                    newStartX = newActualX + newActualW / 2
                    newEndX = newActualX + newActualW / 2
                    newStartY = shape.startY <= shape.endY ? newActualY : newActualY + newActualH
                    newEndY = shape.startY <= shape.endY ? newActualY + newActualH : newActualY
                } else if (actualHeight === 0) {
                    newStartY = newActualY + newActualH / 2
                    newEndY = newActualY + newActualH / 2
                    newStartX = shape.startX < shape.endX ? newActualX : newActualX + newActualW
                    newEndX = shape.startX < shape.endX ? newActualX + newActualW : newActualX
                }
                dispatch(updateShape({
                    id: shapeId,
                    patch: {
                        startX: newStartX,
                        startY: newStartY,
                        endX: newEndX,
                        endY: newEndY
                    }
                })
                )

            }
        }

        const handleResizeEnd = () => {
            isResizingRef.current = false
            resizeDataRef.current = null
        }
        window.addEventListener(
            'shape-resize-start',
            handleResizeStart as EventListener
        )
        window.addEventListener(
            'shape-resize-move',
            handleResizeMove as EventListener
        )
        window.addEventListener('shape-resize-end',
            handleResizeEnd as EventListener
        )

        return () => {
            window.removeEventListener(
                'shape-resize-start',
                handleResizeStart as EventListener
            )
            window.removeEventListener(
                'shape-resize-move',
                handleResizeMove as EventListener
            )
            window.removeEventListener(
                'shape-resize-end',
                handleResizeEnd as EventListener
            )
        }

    }, [
        dispatch, entityState.entities, viewport.scale, viewport.translate
    ])

    const attachCanvasRef = useCallback((ref: HTMLDivElement | null): void => {

        if (canvasRef.current) {
            canvasRef.current.removeEventListener('wheel', onWheel)
            console.log('🗑️ Removed wheel listener from old ref')
        }
        canvasRef.current = ref

        if (ref) {
            ref.addEventListener('wheel', onWheel, { passive: false })
            console.log('✅ Attached wheel listener to canvas ref')
        }
    }, [onWheel])
    const selectTool = (tool: Tool): void => {
        dispatch(setTool(tool))

    }
    const getDraftShape = (): DraftShape | null => draftShapeRef.current
    const getFreeDrawPoints = (): Point[] => freeDrawPointsRef.current

    return {
        viewport,
        shapes: shapeList,
        currentTool,
        selectedShapes,

        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,

        attachCanvasRef,
        selectTool,
        getDraftShape,
        getFreeDrawPoints,
        isSidebarOpen,
        hasSelectedText,
        setIsSidebarOpen,

    }



}

export const useFrame = (shape: FrameShape) => {
    const dispatch = useAppDispatch()

    const [isGenerating, setIsGenerating] = useState(false)


    const allShapes = useAppSelector((state) =>
        Object.values(state.shapes.shapes?.entities || {}).filter(
            (shape): shape is Shape => shape !== undefined
        )
    )
    const handleGenerateDesign = async () => {

        try {
            setIsGenerating(true)
            const snapShot = await generateFrameSnapShot(shape, allShapes)
            downloadBlob(snapShot, `frame-${shape.frameNumber}-snapshot.png`)

            const formData = new FormData()
            formData.append('image', snapShot, `frame-${shape.frameNumber}-snapshot.png`)
            formData.append('frameNumber', shape.frameNumber.toString())
            const urlParams = new URLSearchParams(window.location.search)
            const projectId = urlParams.get('project')
            if (projectId) formData.append('projectId', projectId)

            const response = await fetch('/api/generate', {
                method: 'POST',
                body: formData
            })

            if (!response.ok) {
                const errorText = await response.text()
                throw new Error(`Failed to generate design: ${errorText} (Status: ${response.status}) `)
            }

            const genratedUIPosition = {
                x: shape.x + shape.w + 50,
                y: shape.y,
                w: Math.max(400, shape.w),
                h: Math.max(300, shape.h)
            }
            const generatedUUid = nanoid()

            dispatch(addGeneratedUI({
                ...genratedUIPosition,
                id: generatedUUid,
                uiSpecData: null,
                sourceFrameId: shape.id,
            }))

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let accumulatedMarkup = ''
            let lastUpdateTime = 0
            const UPDATE_THROTTLE_MS = 200

            if (reader) {
                try {
                    while (true) {
                        const { done, value } = await reader.read()
                        if (done) {
                            dispatch(updateShape({
                                id: generatedUUid,
                                patch: { uiSpecData: accumulatedMarkup }
                            }))
                            break
                        }
                        const chunk = decoder.decode(value)
                        accumulatedMarkup += chunk
                        const now = Date.now()

                        if (now - lastUpdateTime >= UPDATE_THROTTLE_MS) {
                            dispatch(updateShape({
                                id: generatedUUid,
                                patch: { uiSpecData: accumulatedMarkup }
                            }))
                            lastUpdateTime = now

                        }

                    }

                } finally {
                    reader.releaseLock()

                }
            }


        } catch (error) {
            toast.error(`Failed to generate UI design: ${error instanceof Error ? error.message : 'Unknown error'}`)

        }
        finally {
            setIsGenerating(false)
        }
    }
    return { isGenerating, handleGenerateDesign }


}

export const useInspiration = () => {
    const [isInspirationOpen, setIsInspirationOpen] = useState(false)

    const toggleInspiration = () => {
        setIsInspirationOpen(!isInspirationOpen)
    }

    const openInspiration = () => {
        setIsInspirationOpen(true)
    }

    const closeInspiration = () => {
        setIsInspirationOpen(false)
    }

    return { isInspirationOpen, openInspiration, closeInspiration, toggleInspiration }

}

export const useWorkflowGeneration = () => {
    const dispatch = useAppDispatch()
    const [, { isLoading: isGeneratingWorkflow }] = useGenerateWorkflowMutation()

    const allShapes = useAppSelector((state) =>
        Object.values(state.shapes.shapes?.entities || {}).filter(
            (shape): shape is Shape => shape !== undefined
        )
    )
    const generateWorkflow = async (generatedUUid: string) => {

        try {
            const currentShape = allShapes.find(s => s.id === generatedUUid)

            if (!currentShape || currentShape.type !== 'generatedui') {
                toast.error('Generated UI  not found.')
                return
            }
            if (!currentShape.uiSpecData) {
                toast.error('No UI spec data available for workflow generation.')
                return
            }

            const urlParams = new URLSearchParams(window.location.search)
            const projectId = urlParams.get('project')
            if (!projectId) {
                toast.error('Project ID not found in URL.')
                return
            }

            const pageCount = 4
            toast.loading('Generating workflow...', { id: 'workflow-gen' })

            const baseX = currentShape.x + currentShape.w + 100
            const spacing = Math.max(currentShape.w + 50, 450)

            const workflowPromises = Array.from({ length: pageCount }).map(async (_, index) => {
                try {

                    const response = await fetch('/api/generate/workflow', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            generatedUUid,
                            currentHTML: currentShape.uiSpecData,
                            projectId,
                            pageIndex: index,
                        }),
                    })
                    if (!response.ok) {
                        throw new Error(`Failed to generate workflow for page ${index + 1}: (Status: ${response.status})`)

                    }
                    const workflowPosition = {
                        x: baseX + index * spacing,
                        y: currentShape.y,
                        w: Math.max(400, currentShape.w), // At least 400px wide
                        h: Math.max(300, currentShape.h), // At least 300px high
                    }
                    const workflowId = nanoid()

                    dispatch(addGeneratedUI({
                        ...workflowPosition,
                        id: workflowId,
                        uiSpecData: null,
                        sourceFrameId: currentShape.sourceFrameId,
                        isWorkflowPage: true,
                    }))
                    const reader = response.body?.getReader()
                    const decoder = new TextDecoder()
                    let accumulatedHTML = ''

                    if (reader) {
                        while (true) {

                            const { done, value } = await reader.read()
                            if (done) break
                            const chunk = decoder.decode(value)
                            accumulatedHTML += chunk
                            dispatch(updateShape({
                                id: workflowId,
                                patch: { uiSpecData: accumulatedHTML }
                            })
                            )
                        }
                    }
                    return { pageIndex: index, success: true }


                } catch (error) {
                    console.error(`Error generating workflow for page ${index + 1}:`, error)
                    return { pageIndex: index, success: false, error }


                }
            }
            )

            const results = await Promise.all(workflowPromises)
            const successCount = results.filter((r) => r.success).length
            const failureCount = results.length - successCount
            if (successCount === 4) {
                toast.success('+ All 4 workflow pages generated successfully!', {
                    id: 'workflow-generation',
                })
            } else if (successCount > 0) {
                toast.success(`+ ${successCount} workflow page(s) generated successfully, ${failureCount} failed.`,
                )
            }
            if (failureCount > 0) {
                toast.error(`⚠️ ${failureCount} workflow page(s) failed to generate.`,)
            }
            else {
                toast.error('⚠️ All workflow page generation failed.', { id: 'workflow-gen' })
            }

        }

        catch (error) {
            toast.error(`Failed to generate workflow: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: 'workflow-gen' })
            console.error('Error generating workflow:', error)
        }



    }
    return { isGeneratingWorkflow, generateWorkflow }
}


export const useGlobalChat = () => {
    const [isChatOpen, setIsChatOpen] = useState(false)
    const [activeGeneratedUUid, setActiveGeneratedUUid] = useState<string | null>(null)
    const { generateWorkflow } = useWorkflowGeneration()

    const exportDesign = async (
        generatedUUid: string,
        element: HTMLElement | null
    ) => {
        if (!element) {
            toast.error('Element not found for export.')
            console.error('Element not found for export.')
            return
        }

        try {
            const filename = `generated-ui-${generatedUUid.slice(0, 8)}.png`
            console.log('Exporting design for:', generatedUUid, filename)
            await exportGeneratedUIAsPNG(element, filename)
            toast.success('Design exported successfully.')
        } catch (error) {
            toast.error('Failed to export design.')
            console.error('Failed to export design:', error)
        }

    }

    const openChat = (generatedUUid: string) => {
        setActiveGeneratedUUid(generatedUUid)
        setIsChatOpen(true)
    }

    const closeChat = () => {
        setIsChatOpen(false)
        setActiveGeneratedUUid(null)
    }

    const toggleChat = (generatedUUid: string) => {
        if (isChatOpen && activeGeneratedUUid === generatedUUid) {
            closeChat()
        } else {
            openChat(generatedUUid)
        }
    }

    return {
        isChatOpen,
        activeGeneratedUUid,
        generateWorkflow,
        exportDesign,
        openChat,
        closeChat,
        toggleChat
    }
}


export const useChatWindow = (generatedUUid: string, isOpen: boolean) => {

    const [inputValue, setInputValue] = useState('')
    const scrollAreaRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const dispatch = useAppDispatch()
    const chatState = useAppSelector((state) => state.chat.chats[generatedUUid])
    const currentShape = useAppSelector((state) => state.shapes.shapes.entities[generatedUUid])
    const allShapes = useAppSelector((state) => state.shapes.shapes.entities)

    const getSourceFrame = (): FrameShape | null => {
        if (!currentShape || currentShape.type !== 'generatedui') {
            return null
        }
        const sourceFrameId = currentShape.sourceFrameId
        if (!sourceFrameId) return null
        const sourceFrame = allShapes[sourceFrameId]
        if (!sourceFrame || sourceFrame.type !== 'frame') {
            return null
        }

        return sourceFrame as FrameShape




    }
    useEffect(() => {
        if (isOpen) {
            dispatch(initializeChat(generatedUUid))
        }

    }, [isOpen, dispatch, generatedUUid])

    useEffect(() => {
        if (scrollAreaRef.current) {
            scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight
        }
    }, [])
    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 100)
        }
    }, [isOpen])

    const handleSendMessage = async () => {
        if (!inputValue.trim() || chatState?.isStreaming) return
        const message = inputValue.trim()
        setInputValue('')

        try {
            dispatch(addUserMessage({ generatedUUid, content: message }))
            const responseId = `response-${Date.now()}`
            dispatch(startStreamResponse({ generatedUUid, messageId: responseId }))
            const isWorkflowPage = currentShape?.type === 'generatedui' && currentShape.isWorkflowPage
            const urlParams = new URLSearchParams(window.location.search)
            const projectId = urlParams.get('project')
            if (!projectId) {
                throw new Error('Project ID not found in URL.')

            }
            const baseRequestData = {
                userMessage: message,
                generatedUUid: generatedUUid,
                currentHTML: currentShape?.type === 'generatedui' ? currentShape.uiSpecData : null,
                projectId: projectId

            }


            let apiEndpoint = '/api/generate/redesign'
            let wireframeSnapshot: string | null = null

            if (isWorkflowPage) {
                apiEndpoint = '/api/generate/workflow-redesign'


            } else {
                const sourceFrame = getSourceFrame()

                if (sourceFrame) {
                    try {
                        const allShapesArray = Object.values(allShapes).filter(Boolean) as Shape[]

                        const snapshot = await generateFrameSnapShot(sourceFrame, allShapesArray)
                        const arrayBuffer = await snapshot.arrayBuffer()
                        const base64 = btoa(
                            String.fromCharCode(...new Uint8Array(arrayBuffer))
                        )
                        wireframeSnapshot = base64


                    } catch (error) {
                        console.warn('Failed to generate wireframe snapshot:', error)

                    }
                }
                else {
                    console.warn('Source frame not found for generated UI:')

                }



            }
            const requestData = isWorkflowPage ? baseRequestData :
                { ...baseRequestData, wireframeSnapshot }

            const response = await fetch(apiEndpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestData)
            })

            if (!response.ok) {
                throw new Error(`Failed to get response from server: (Status: ${response.status})`)
            }

            const reader = response.body?.getReader()
            const decoder = new TextDecoder()
            let accumulatedContent = ''
            if (reader) {
                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    const chunk = decoder.decode(value)
                    accumulatedContent += chunk

                    dispatch(updateStreamingContent({
                        generatedUUid,
                        messageId: responseId,
                        content: 'Regenerating your design..'
                    }))

                    dispatch(
                        updateShape({
                            id: generatedUUid,
                            patch: { uiSpecData: accumulatedContent }
                        })
                    )




                }
            }

            dispatch(
                finishStreamingResponse({
                    generatedUUid,
                    messageId: responseId,
                    finalContent: 'Regenerated your design'
                })
            )




        } catch (error) {
            console.error('Error sending message:', error)
            dispatch(addErrorMessage({
                generatedUUid,
                error: error instanceof Error ? error.message : 'Unknown error'
            }))
            toast.error('Failed to regenerate your design.')

        }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSendMessage()
        }
    }
    const handleClearChat = () => {
        dispatch(clearChat(generatedUUid))
    }

    return {
        inputValue,
        setInputValue,
        scrollAreaRef,
        inputRef,
        handleSendMessage,
        handleKeyPress,
        handleClearChat,
        chatState
    }



}