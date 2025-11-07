
import InfiniteCanvas from '@/components/canvas'
import ProjectProvider from '@/components/projects/provider'
import { ProjectQuery } from '@/convex/query.config'
import React from 'react'

interface CanvasProps{
  searchParams:Promise<{project?:string}>
}

const page =  async ({searchParams}:CanvasProps) => {
  const params = await searchParams
  const projectId = params.project
  if(!projectId){
    return(
      <div className='w-full h-screen flex  items-center justify-center'>
        <p className='text-muted-foreground'>No project selected</p>
      </div>
    )
  }



  const {project,profile}=await ProjectQuery(projectId)

  if(!profile){
    return(
      <div className='w-full h-screen flex  items-center justify-center'>
        <p className='text-muted-foreground'>No profile found</p>
      </div>
    )
  }

if(!project){
    return(
      <div className='w-full h-screen flex  items-center justify-center'>
        <p className='text-muted-foreground'>No project found or access denied</p>
      </div>
    )
  }

  return (
    <ProjectProvider initialProject={project}>
      <InfiniteCanvas />
    </ProjectProvider>
  )
}

export default page