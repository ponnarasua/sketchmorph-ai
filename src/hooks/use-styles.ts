import { useMutation } from "convex/react"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { api } from "../../convex/_generated/api"
import { toast } from "sonner"
import { Id } from "../../convex/_generated/dataModel"
import { useGenerateStyleGuideMutation } from "@/redux/api/style-guide"
import { GeneratedUIShape, updateShape } from "@/redux/slice/shapes"
import { useAppDispatch } from "@/redux/store"

export interface MoodBoardImage {
    id: string
    file?: File // Optional for server-loaded images
    preview: string // Local preview URL or Convex URL
    storageId?: string
    uploaded: boolean
    uploading: boolean
    error?: string
    url?: string // Convex URL for uploaded images
    isFromServer?: boolean // Track if image came from server

}

interface StylesFormat {
    images: MoodBoardImage[]
}
export const useMoodBoard = (guideImages: MoodBoardImage[], projectId?: string) => {
    console.log('useMoodBoard called with projectId:', projectId, 'guideImages length:', guideImages?.length)
    const [dragActive, setDragActive] = useState(false)
    const form = useForm<StylesFormat>({
        defaultValues: {
            images: []
        }
    })

    const { watch, setValue, getValues } = form
    const images = watch('images')
    const generateUploadUrl = useMutation(api.moodboard.generateUploadUrl)
    const removeMoodBoardImage = useMutation(api.moodboard.removeMoodBoardImage)
    const addMoodBoardImage = useMutation(api.moodboard.addMoodBoardImage)

    const uploadImage = async (file: File): Promise<{ storageId: string; url?: string }> => {
        console.log('uploadImage called with projectId:', projectId)
        try {
            const uploadUrl = await generateUploadUrl()
            const result = await fetch(uploadUrl, {
                method: 'POST',
                body: file,
                headers: { 'Content-Type': file.type }
            })
            if (!result.ok) {
                throw new Error(`Upload failed:${result.statusText}`)
            }
            const { storageId } = await result.json()
            console.log('Upload successful, storageId:', storageId, 'projectId check:', !!projectId)
            if (projectId) {
                console.log('Calling addMoodBoardImage with projectId:', projectId, 'storageId:', storageId)
                await addMoodBoardImage({
                    projectId: projectId as Id<'projects'>,
                    storageId: storageId as Id<'_storage'>
                })
                console.log('addMoodBoardImage completed successfully')
            } else {
                console.log('WARNING: projectId is falsy, not saving to database')
            }
            return { storageId }
        } catch (error) {
            console.error('Error uploading image:', error)
            throw error
        }


    }
    useEffect(() => {
        if (guideImages && guideImages.length > 0) {
            const serverImages: MoodBoardImage[] = guideImages.map((img: any) => ({
                id: img.id,
                preview: img.url,
                storageId: img.storageId,
                uploaded: true,
                uploading: false,
                url: img.url,
                isFromServer: true,
            }))

            const currentImages = getValues('images')
            if (currentImages.length === 0) {
                setValue('images', serverImages)

            }
            else {
                const mergedImages = [...currentImages]
                serverImages.forEach((serverImg) => {
                    const clientIndex = mergedImages.findIndex(
                        (clientImg) => clientImg.storageId === serverImg.storageId
                    )
                    if (clientIndex === -1) {
                        if (mergedImages[clientIndex].preview.startsWith('blob:')) {
                            URL.revokeObjectURL(mergedImages[clientIndex].preview)
                        }
                        mergedImages[clientIndex] = serverImg

                    }
                })
            }
        }

    }, [guideImages, setValue, getValues])


    const addImage = (file: File) => {
        if (images.length >= 5) {
            toast.error('Maximum of 5 images allowed')
            return
        }
        const newImage: MoodBoardImage = {
            id: `${Date.now()}-${Math.random()}}`,
            file,
            preview: URL.createObjectURL(file),
            uploaded: false,
            uploading: false,
            isFromServer: false
        }

        const updatedImages = [...images, newImage]
        setValue('images', updatedImages)
        toast.success('Image added to mood board')


    }

    const removeImage = async (imageId: string) => {
        const imageToRemove = images.find((img) => img.id === imageId)
        if (!imageToRemove) return
        if (imageToRemove.isFromServer && imageToRemove.storageId && projectId) {
            try {
                await removeMoodBoardImage({
                    projectId: projectId as Id<'projects'>,
                    storageId: imageToRemove.storageId as Id<'_storage'>
                })
            } catch (error) {
                console.log(error)
                toast.error('Error removing image from server:')
                return

            }

        }


        const updatedImages = images.filter((img) => {
            if (img.id === imageId) {
                if (!img.isFromServer && img.preview.startsWith('blob:')) {
                    URL.revokeObjectURL(img.preview)
                }
                return false

            }
            return true
        }

        )

        setValue('images', updatedImages)
        toast.success('Image removed from mood board')

    }

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        }
        else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        const files = Array.from(e.dataTransfer.files)
        const imageFiles = files.filter((file) => file.type.startsWith('image/'))
        if (imageFiles.length === 0) {
            toast.error('Please drop  image only')
            return
        }
        imageFiles.forEach((file) => {
            if (images.length < 5) {
                addImage(file)
            }
        })
    }
    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])
        files.forEach((file) => addImage(file))
        e.target.value = ''
    }
    useEffect(() => {
        const uploadPendingImages = async () => {
            const currentImages = getValues('images')
            for (let i = 0; i < currentImages.length; i++) {
                const image = currentImages[i]
                if (!image.uploaded && !image.uploading && !image.isFromServer) {
                    const updatedImages = [...currentImages]
                    updatedImages[i] = { ...image, uploading: true }
                    setValue('images', updatedImages)
                    try {
                        const { storageId } = await uploadImage(image.file!)
                        const finalImages = getValues('images')
                        const finalIndex = finalImages.findIndex((img) => img.id === image.id)
                        if (finalIndex !== -1) {
                            finalImages[finalIndex] = {
                                ...finalImages[finalIndex],
                                storageId,
                                uploaded: true,
                                uploading: false,
                                isFromServer: true,
                            }
                            setValue('images', [...finalImages])

                        }
                    } catch (error) {
                        console.error('Error uploading image:', error)
                        const erroredImages = getValues('images')
                        const errorIndex = erroredImages.findIndex((img) => img.id === image.id)
                        if (errorIndex !== -1) {
                            erroredImages[errorIndex] = {
                                ...erroredImages[errorIndex],
                                uploading: false,
                                error: 'Upload failed',
                            }
                            setValue('images', [...erroredImages])
                        }
                    }
                }

            }
        }
        if (images.length > 0) {
            uploadPendingImages()
        }
    }, [images, setValue, getValues])

    useEffect(() => {
        return () => {
            images.forEach((image) => {
                URL.revokeObjectURL(image.preview)
            })
        }
    }, [])
    return {
        form,
        images,
        dragActive,
        addImage,
        removeImage,
        handleDrag,
        handleDrop,
        handleFileInput,
        canAddMore: images.length < 5
    }

}

export const useStyleguide = (
    projectId: string,
    images: MoodBoardImage[],
    fileInputRef: React.RefObject<HTMLInputElement | null>
) => {
    const [generateStyleGuide, { isLoading: isGenerating }] = useGenerateStyleGuideMutation()
    const router = useRouter()
    const handleUploadClick = () => fileInputRef.current?.click()
    const handleGenerateStyleGuide = async () => {
        if (!projectId) {
            toast.error('Project ID is missing')
            return
        }
        if (images.length === 0) {
            toast.error('Please add at least one image to generate style guide')
            return
        }
        try {
            toast.loading('Analyzing mood board images...', {
                id: 'style-guide-generation'
            })
            console.log('About to call generateStyleGuide with projectId:', projectId)
            console.log('Images count:', images.length)
            const result = await generateStyleGuide({ projectId }).unwrap()
            console.log('generateStyleGuide result:', result)
            if (!result.success) {
                toast.error(result.message, {
                    id: 'style-guide-generation'
                })
                return
            }
            router.refresh()
            toast.success('Style guide generated successfully', {
                id: 'style-guide-generation'
            })

            setTimeout(() => {
                toast.success('Style guide generated! Switch to the colours tab to see the results',
                    { duration: 5000 }
                )
            }, 1000)

        } catch (error) {
            const errorMessage = error && typeof error === 'object' &&
                'error' in error ? (error as { error: string }).error : 'Failed to generate style guide'
            toast.error(errorMessage, {
                id: 'style-guide-generation'
            })
        }

    }
    return { handleUploadClick, handleGenerateStyleGuide, isGenerating }
}


export const useUpdateContainer = (shape: GeneratedUIShape) => {
    const dispatch = useAppDispatch()
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (containerRef.current && shape.uiSpecData) {
            const timeoutId = setTimeout(() => {
                const actualHeight = containerRef.current?.offsetHeight || 0
                if (actualHeight > 0 && Math.abs(actualHeight - shape.h) > 10) {
                    dispatch(
                        updateShape({
                            id: shape.id,
                            patch: { h: actualHeight }
                        })
                    )

                }
            }, 100)
            return () => clearTimeout(timeoutId)
        }
    }, [shape.uiSpecData, shape.h, shape.id, dispatch])

    const sanitizeHtml = (html: string) => {
        const sanitized = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
            .replace(/on\w+="[^"]*"/gi, '') // Remove event handlers
            .replace(/javascript:/gi, '') // Remove javascript: protocols
            .replace(/data:/gi, '') // Remove data: protocols for safety

        return sanitized
    }
    return { containerRef, sanitizeHtml }

}