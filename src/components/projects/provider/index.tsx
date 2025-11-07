'use client'
import { loadProject } from '@/redux/slice/shapes'
import { restoreViewport } from '@/redux/slice/viewport'
import { useAppDispatch } from '@/redux/store'
import React, { useEffect } from 'react'

type Props={
    children: React.ReactNode,
    initialProject:any
}

const ProjectProvider = ({children,initialProject  }:Props) => {
const dispatch=useAppDispatch()
useEffect(()=>{
    // Fix: Access the correct data structure from Convex preloadQuery
    if(initialProject?._valueJSON){
        const projectData = initialProject._valueJSON
        console.log('Loading project data:', projectData)

        if(projectData.sketchesData){
            dispatch(loadProject(projectData.sketchesData))
        }

        if(projectData.viewportData){
            dispatch(restoreViewport(projectData.viewportData))
        }
    }
},[dispatch,initialProject])

  return (
    <div>{children}</div>
  )
}

export default ProjectProvider