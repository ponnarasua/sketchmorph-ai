import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { getAuthUserId } from '@convex-dev/auth/server'


export const getProject = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const userId = await getAuthUserId(ctx)
        if (!userId) throw new Error('Not authenticated')

        const project = await ctx.db.get(projectId)
        if (!project) throw new Error('Project not found')

        // Check ownership or public access
        if (project.userId !== userId && !project.isPublic) {
            throw new Error('Access denied')

        }

        return project
    },
})

export const createProject = mutation({
    args: {
        userId: v.id('users'),
        name: v.optional(v.string()),
        sketchesData: v.any(),
        thumbnail: v.optional(v.string()),
    },
    handler: async (ctx, { userId, name, sketchesData, thumbnail }) => {
        console.log('Creating project for user:', userId)

        const projectNumber = await getNextProjectNumber(ctx, userId)
        const projectName = name || `Project ${projectNumber}`
        const projectId = await ctx.db.insert('projects', {
            userId,
            name: projectName,
            sketchesData,
            thumbnail,
            projectNumber,
            lastModified: Date.now(),
            createdAt: Date.now(),
            isPublic: false,
        })


        console.log('Created project  :', {
            projectId, name: projectName, projectNumber
        })


        return {
            projectId,
            name: projectName,
            projectNumber,
        }



    }

})














async function getNextProjectNumber(ctx: any, userId: string): Promise<number> {
    const counter = await ctx.db.query('project_counters').withIndex('by_userId', (q: any) => q.eq('userId', userId)).first()
    if (!counter) {
        await ctx.db.insert('project_counters', {
            userId,
            nextProjectNumber: 2,
        })
        return 1
    }

    const projectNumber = counter.nextProjectNumber
    await ctx.db.patch(counter._id, {
        nextProjectNumber: projectNumber + 1,
    })
    return projectNumber
}

export const getUserProjects = query({
    args: {
        userId: v.id('users'),
        limit: v.optional(v.number())
    },
    handler: async (ctx, { userId, limit = 20 }) => {
        const allProjects = await ctx.db.query('projects').withIndex('by_userId', (q) => q.eq('userId', userId)).order('desc').collect()
        const projects = allProjects.slice(0, limit)

        return projects.map((project) => ({
            _id: project._id,
            name: project.name,
            projectNumber: project.projectNumber,
            thumbnail: project.thumbnail,
            lastModified: project.lastModified,
            createdAt: project.createdAt,
            isPublic: project.isPublic,
        }))
    },

})

export const getProjectStyleGuide = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const userId = await getAuthUserId(ctx)
        if (!userId) throw new Error('Not authenticated')

        const project = await ctx.db.get(projectId)
        if (!project) throw new Error('Project not found')

        // Check ownership or public access
        if (project.userId !== userId && !project.isPublic) {
            throw new Error('Access denied')
        }

        // Return parsed style guide data or null
        return project.styleGuide ? JSON.parse(project.styleGuide) : null
    },
})


export const updateProjectSketches = mutation({
    args: {
        projectId: v.id('projects'),
        sketchesData: v.any(),
        viewportData: v.optional(v.any())
    },
    handler: async (ctx, { projectId, sketchesData, viewportData }) => {
        const project = await ctx.db.get(projectId)
        if (!project) throw new Error('Project not found')
        const updateData: any = {
            sketchesData,
            lastModified: Date.now()
        }
        if (viewportData) {
            updateData.viewportData = viewportData
        }

        await ctx.db.patch(projectId, updateData)
        console.log('Project sketches updated:')
        return { success: true }
    }
})


export const updateProjectStyleGuide = mutation({
    args: {
        projectId: v.id('projects'),
        styleGuideData: v.any(),
    },

    handler: async (ctx, { projectId, styleGuideData }) => {
        console.log('Updating style guide for project:', projectId)
        const userId = await getAuthUserId(ctx)
        if (!userId) throw new Error('Not authenticated')
        const project = await ctx.db.get(projectId)
        if (!project) throw new Error('Project not found')
        if (project.userId !== userId) throw new Error('Access denied')
        await ctx.db.patch(projectId, {
            styleGuide: JSON.stringify(styleGuideData),
            lastModified: Date.now()
        })
        console.log('Style guide updated for project:', projectId)
        return { success: true,styleGuide:styleGuideData  }
    },
})