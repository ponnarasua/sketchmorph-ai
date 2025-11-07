import { FrameShape, Shape } from "@/redux/slice/shapes"
import { toast } from "sonner"

export const isShapeInsideFrame = (shape: Shape, frame: FrameShape): boolean => {
    const frameLeft = frame.x
    const frameTop = frame.y
    const frameRight = frame.x + frame.w
    const frameBottom = frame.y + frame.h

    switch (shape.type) {
        case 'rect':
        case 'ellipse':
        case 'frame':
            const centerX = shape.x + shape.w / 2
            const centerY = shape.y + shape.h / 2
            return (
                centerX > frameLeft &&
                centerX <= frameRight &&
                centerY >= frameTop &&
                centerY <= frameBottom

            )
        case 'text':
            return (
                shape.x >= frameLeft &&
                shape.x <= frameRight &&
                shape.y >= frameTop &&
                shape.y <= frameBottom
            )
        case 'freedraw':
            // Check if any drawing points are
            return shape.points.some(
                (point) =>
                    point.x >= frameLeft &&
                    point.x <= frameRight &&
                    point.y > frameTop &&
                    point.y <= frameBottom

            )

        case 'line':
        case 'arrow':
            // Check if either start or end point is within frame
            const startInside =
                shape.startX >= frameLeft &&
                shape.startX <= frameRight &&
                shape.startY > frameTop &&
                shape.startY <= frameBottom
            const endInside =
                shape.endX >= frameLeft &&
                shape.endX <= frameRight &&
                shape.endY >= frameTop &&
                shape.endY <= frameBottom
            return startInside || endInside

        default:
            return false

    }

}

export const getShapesInsideFrame = (
    shapes: Shape[],
    frame: FrameShape
): Shape[] => {
    // Simple coordinate-based detection: find shapes within frame bounds
    const shapesInFrame = shapes.filter(
        (shape) => shape.id !== frame.id && isShapeInsideFrame(shape, frame)

    )

    console.log(`Frame ${frame.frameNumber} capture:`, {
        totalShapes: shapes.length,
        captured: shapesInFrame.length,
        capturedTypes: shapesInFrame.map((s) => s.type),
    })

    return shapesInFrame
}
const renderShapeOnCanvas = (
    ctx: CanvasRenderingContext2D,
    shape: Shape,
    frameX: number,
    frameY: number
) => {
    ctx.save()

    switch (shape.type) {
        case 'rect':
        case 'frame':
        case 'ellipse':
            const relativeX = shape.x - frameX
            const relativeY = shape.y - frameY

            if (shape.type === 'rect' || shape.type === 'frame') {
                ctx.strokeStyle =
                    shape.stroke && shape.stroke !== 'transparent'
                        ? shape.stroke
                        : '#ffffff'
                ctx.lineWidth = shape.strokeWidth || 2
                const borderRadius = shape.type === 'rect' ? 8 : 0
                ctx.beginPath()
                ctx.roundRect(relativeX, relativeY, shape.w, shape.h, borderRadius)
                ctx.stroke()
            } else if (shape.type === 'ellipse') {

                ctx.strokeStyle = shape.stroke && shape.stroke !== 'transparent' ? shape.stroke : '#ffffff'
                ctx.lineWidth = shape.strokeWidth || 2
                ctx.beginPath()
                ctx.ellipse(
                    relativeX + shape.w / 2,
                    relativeY + shape.h / 2,
                    shape.w / 2,
                    shape.h / 2,
                    0,
                    0,
                    2 * Math.PI
                )
                ctx.stroke()
            }
            break

        case 'text':
            const textRelativeX = shape.x - frameX
            const textRelativeY = shape.y - frameY
            ctx.fillStyle = shape.fill || '#ffffff'
            ctx.font = `${shape.fontSize}px ${shape.fontFamily || 'Inter, sans-serif'}`
            ctx.textBaseline = 'top'
            ctx.fillText(shape.text, textRelativeX, textRelativeY)
            break
        case 'freedraw':
            if (shape.points.length > 1) {
                ctx.strokeStyle = shape.stroke || '#ffffff'
                ctx.lineWidth = shape.strokeWidth || 2
                ctx.lineCap = 'round'
                ctx.lineJoin = 'round'
                ctx.beginPath()
                const firstPoint = shape.points[0]
                ctx.moveTo(firstPoint.x - frameX, firstPoint.y - frameY)
                for (let i = 1; i < shape.points.length; i++) {
                    const point = shape.points[i]
                    ctx.lineTo(point.x - frameX, point.y - frameY)
                }
                ctx.stroke()
            }
            break
        case 'line':
            ctx.strokeStyle = shape.stroke || '#ffffff'
            ctx.lineWidth = shape.strokeWidth || 2
            ctx.beginPath()
            ctx.moveTo(shape.startX - frameX, shape.startY - frameY)
            ctx.lineTo(shape.endX - frameX, shape.endY - frameY)
            ctx.stroke()
            break
        case 'arrow':
            ctx.strokeStyle = shape.stroke || '#ffffff'
            ctx.lineWidth = shape.strokeWidth || 2
            ctx.beginPath()
            ctx.moveTo(shape.startX - frameX, shape.startY - frameY)
            ctx.lineTo(shape.endX - frameX, shape.endY - frameY)
            ctx.stroke()

            const headLength = 10
            const angle = Math.atan2(shape.endY - shape.startY, shape.endX - shape.startX)
            ctx.fillStyle = shape.stroke || '#ffffff'
            ctx.beginPath()
            ctx.moveTo(shape.endX - frameX, shape.endY - frameY)
            ctx.lineTo(
                shape.endX - frameX - headLength * Math.cos(angle - Math.PI / 6),
                shape.endY - frameY - headLength * Math.sin(angle - Math.PI / 6)
            )
            ctx.lineTo(
                shape.endX - frameX - headLength * Math.cos(angle + Math.PI / 6),
                shape.endY - frameY - headLength * Math.sin(angle + Math.PI / 6)
            )
            ctx.closePath()
            ctx.stroke()
            ctx.fill()
            break
    }
    ctx.restore()

}

export const generateFrameSnapShot = async (
    frame: FrameShape,
    allShapes: Shape[]
): Promise<Blob> => {
    const shapesInFrame = getShapesInsideFrame(allShapes, frame)
    const canvas = document.createElement('canvas')
    canvas.width = frame.w
    canvas.height = frame.h

    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, canvas.width, canvas.height)
    ctx.clip()
    shapesInFrame.forEach((shape) => {
        renderShapeOnCanvas(ctx, shape, frame.x, frame.y)
    })
    ctx.restore()
    console.log('🖼All shapes rendered')

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob) {
                resolve(blob)
            }
            else {
                reject(new Error('Failed to generate blob from canvas'))
            }

        }, " image/png", 1.0)
    })

}

7

export const downloadBlob = (blob: Blob, filename: string): void => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
 
    URL.revokeObjectURL(url)

}

export const captureVisualContent=async(
    ctx:CanvasRenderingContext2D,
    element:HTMLElement,
    width:number,
    height:number
)=>{

    const {toPng}= await import('html-to-image')
    const dataUrl=await toPng(element,{
        width:width,
        height:height,
        backgroundColor:'#ffffff',
        pixelRatio:1,
        cacheBust:true,
        includeQueryParams:false,
        skipAutoScale:true,
        skipFonts:true,
        filter:(node)=>{
            if(node.nodeType===Node.TEXT_NODE) return true
            if(node.nodeType===Node.ELEMENT_NODE){
                const element=node as HTMLElement
                return![
                    'SCRIPT',
                    'STYLE',
                    'BUTTON',
                    'SELECT',
                    'INPUT',
                    'TEXTAREA',
                ].includes(element.tagName)
            }
            return true
        }
    })

    const img=new Image()

    await new Promise((ressolve,reject)=>{
        img.onload=()=>{
            ctx.drawImage(img,0,0,width,height)
            console.log('Visual content captured to canvas')
            ressolve(true)
        }
        img.onerror=(error)=>{
            reject(new Error('Failed to load image for visual content capture'))

        }
        img.src=dataUrl
    })




}

export const exportGeneratedUIAsPNG=async (
    element:HTMLElement,
    filename:string
)=>{
    try {
        const rect=element.getBoundingClientRect()
        const canvas=document.createElement('canvas')
        canvas.width=rect.width
        canvas.height=rect.height
        const ctx=canvas.getContext('2d')
        if(!ctx) {
            throw new Error('Failed to get canvas context')
        }
        ctx.fillStyle='#ffffff'
        ctx.fillRect(0,0,canvas.width,canvas.height)

        const contentDiv=element.querySelector(
            'div[style*="pointer-events: auto"]'
        ) as HTMLElement

        if(contentDiv){
            console.log('Found content div, rendering to canvas')

            await captureVisualContent(ctx,contentDiv,rect.width,rect.height)
        } else{
            throw new Error('Content div not found')
        }

        canvas.toBlob((blob)=>{
            if(blob){
                console.log('Generated UI snapshot blob created',{
                    size:blob.size,
                    type:blob.type,
                    filename
                })
                downloadBlob(blob,filename)

            } else{
                console.log('Failed to create blob from canvas')
            }
        },
        'image/png',1.0)


    } catch (error) {
        toast.error('Failed to export design.')
        console.error('Failed to export design:', error)
        throw error
    }

}