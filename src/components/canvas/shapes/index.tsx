import { Shape } from '@/redux/slice/shapes'
import React from 'react'
import { Frame } from './frame'
import { Rectangle } from './rectangle'
import { Elipse } from './elipse'
import { Text } from './text'
import { Arrow } from './arrow'
import { Stroke } from './stroke'
import { Line } from './line'
import GeneratedUI from './generatedui'

const ShapesRenderer = ({
    shape,
    toggleInspiration,
    toggleChat,
    generateWorkflow,
    exportDesign
}:{
    shape:Shape
    toggleInspiration?:()=>void
    toggleChat?:(generatedUIId:string)=>void
    generateWorkflow?:(generatedUIId:string)=>void
    exportDesign?:(generateUIId:string,element:HTMLElement | null)=>void
}) => {
 
    switch (shape.type) {
         case 'frame':
            return(
                <Frame shape={shape} toggleInspiration={toggleInspiration ?? (() => {})}  />
            )
         case 'rect':
            return(
                <Rectangle shape={shape}  />
            )  
        case 'ellipse':
            return <Elipse shape={shape}  />
        case 'text':
            return <Text shape={shape}  />
        case 'arrow':
            return <Arrow shape={shape}  />
        case 'freedraw':
            return <Stroke shape={shape}  />
        case 'line':
            return <Line shape={shape}  />
        case 'generatedui':
           return (
             <GeneratedUI 
            shape={shape}
            toggleChat={toggleChat ?? (() => {})}
            generateWorkflow={generateWorkflow ?? (() => {})}
            exportDesign={exportDesign ?? (() => {})}
            />  
           )  
        default:
            return null
 
    }



}

export default ShapesRenderer
