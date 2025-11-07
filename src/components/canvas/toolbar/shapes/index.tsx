"use client"
import { Button } from '@/components/ui/button'
import { useInfiniteCanvas, useInspiration } from '@/hooks/use-canvas'
import { cn } from '@/lib/utils'
import { Tool } from '@/redux/slice/shapes'
import { ArrowRight, Circle, Eraser, Hash, ImageIcon, Minus, MousePointer2, Pencil, Square } from 'lucide-react'
import React from 'react'
import { Rectangle } from 'recharts'

const tools:Array<{
    id:Tool | 'inspiration'
    icon:React.ReactNode
    label:string
    description:string
}>=[
    {id:'select',
      icon:<MousePointer2 className='w-4 h-4'  />,
      label:'Select ',
        description:'Select and move shapes'

    },
    {
        id:'frame',
        icon:<Hash className='w-4 h-4'  />,
        label:'Frame',
        description:'Draw frame continer'
    },
    {
        id:'rect',
        icon: <Square className='w-4 h-4'  />,
        label:'Rectangle',
        description:'Draw rectangle shape'
    },
    {
        id:'ellipse',
        icon:<Circle className='w-4 h-4'  />,
        label:'Ellipse',
        description:'Draw ellipse shape'
    },
    {
        id:'freedraw',
        icon:<Pencil className='w-4 h-4'  />,
        label:'Freedraw',
        description:'Draw freehand shapes'
    },
    {
        id:'arrow',
        icon:<ArrowRight className='w-4 h-4'  />,
        label:'Arrow',
        description:'Draw arrow shapes'
    },
    {
        id:'line',
        icon:<Minus className='w-4 h-4'  />,
        label:'Line',
        description:'Draw line shapes'
    },
    {
    id:'text',
        icon:<Rectangle className='w-4 h-4'  />,
        label:'Text',
        description:'Add text boxes'
    },
    {
        id:'eraser',
        icon:<Eraser className='w-4 h-4'  />,
        label:'Eraser',
        description:'Erase shapes'
    },
    {
        id:'inspiration',
        icon:<ImageIcon className='w-4 h-4'  />,
        label:'Inspiration',
        description:'Open inspiration board'
    }


]
const ToolBarShapes = () => {

    const {currentTool,selectTool} = useInfiniteCanvas()
    const {toggleInspiration} = useInspiration()

  return (
    <div className='col-span-1 flex items-center justify-center'>
        <div className='flex items-center gap-2 backdrop-blur-xl
         bg-white/[0.08] border border-white/[0.12] rounded-full p-2 saturate-150 backdrop-[url("#displacementFilter")]'>
            {tools.map((tool)=>(
            <Button 
            key={tool.id}
            variant={'ghost'}
            size='lg'
            onClick={()=>{
                if (tool.id === 'inspiration') {
                    toggleInspiration()
                } else {
                    selectTool(tool.id as Tool)
                }
            }}
            className={cn('cursor-pointer rounded-full p-3',
            currentTool===tool.id
            ?'bg-white/[0.12] border border-white/[0.12]  text-primary/90'
            :'text-primary/50 hover:bg-white/[0.06] border  border-transparent'
            )}
            title={`${tool.label} - ${tool.description}`}
            >
                {tool.icon}



            </Button>

            ))}

        </div>

    </div>
  )
}

export default ToolBarShapes 