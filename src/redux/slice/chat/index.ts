import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ChatMessage{
    id:string
    role:'user' | 'assistant' 
    content:string
    timestamp:string
    isStreaming?:boolean
}

export interface GeneratedUIChat{
    generatedUUid:string
    messages:ChatMessage[]
    isStreaming:boolean
    streamingMessageId:string | null
}

interface ChatState{
    chats: Record<string,GeneratedUIChat>
}

const initialState: ChatState = {
    chats: {} 
}

const chatSlice=createSlice({
    name:'chat',
    initialState,
    reducers:{
        initializeChat:(state,action:PayloadAction<string>)=>{
            const generatedUUid=action.payload
            if(!state.chats[generatedUUid])
            { 
                 state.chats[generatedUUid]={
                    generatedUUid,
                    messages:[],
                    isStreaming:false,
                    streamingMessageId:null
                }
            }
        },
        addUserMessage:(state,action:PayloadAction<{generatedUUid:string;content:string}>)=>{
            const {generatedUUid,content}=action.payload
            const chat=state.chats[generatedUUid]
            if(chat){
                chat.messages.push({
                    id:`user-${Date.now()}`,
                    role:'user',
                    content,
                    timestamp:new Date().toISOString()
                })
            }
        },
        startStreamResponse:(state,action:PayloadAction<{generatedUUid:string;messageId:string}>)=>{
            const {generatedUUid,messageId}=action.payload
            const chat=state.chats[generatedUUid]
            if(chat){
                chat.isStreaming=true
                chat.streamingMessageId=messageId

                chat.messages.push({
                    id:messageId,
                    role:'assistant',
                    content:'',
                    timestamp:new Date().toISOString(),
                    isStreaming:true
                })
            }
          },
          updateStreamingContent:(state,action:PayloadAction<{generatedUUid:string;content:string;messageId:string}>)=>{
            const {generatedUUid,content,messageId}=action.payload
            const chat=state.chats[generatedUUid]
            if(chat){
                const messageIndex=chat.messages.findIndex((msg)=>msg.id===messageId)

                if(messageIndex!==-1){
                    chat.messages[messageIndex].content=content
                }
                
            }


          },
          finishStreamingResponse:(state,action:PayloadAction<{generatedUUid:string;messageId:string;finalContent:string}>)=>{
            const {generatedUUid,messageId,finalContent}=action.payload
            const chat=state.chats[generatedUUid]
            if(chat){
                chat.isStreaming=false
                chat.streamingMessageId=null
                const messageIndex=chat.messages.findIndex((msg)=>msg.id===messageId)

                if(messageIndex!==-1){
                    chat.messages[messageIndex].content=finalContent
                    chat.messages[messageIndex].isStreaming=false
                }
            }


    },
    addErrorMessage:(state,action:PayloadAction<{generatedUUid:string;error:string}>)=>{
        const {generatedUUid,error}=action.payload
        const chat=state.chats[generatedUUid]
        if(chat){
            chat.isStreaming=false
            chat.streamingMessageId=null
            chat.messages.push({
                id:`error-${Date.now()}`,
                role:'assistant',
                content:`Sorry I encountered an error: ${error}`,
                timestamp:new Date().toISOString()
            })
        }

    },
    clearChat:(state,action:PayloadAction<string>)=>{
        const generatedUUid=action.payload

        if(state.chats[generatedUUid]){
            state.chats[generatedUUid].messages=[]
            state.chats[generatedUUid].isStreaming=false
            state.chats[generatedUUid].streamingMessageId=null
        }
    },
    removeChat:(state,action:PayloadAction<string>)=>{
        const generatedUUid=action.payload
        delete state.chats[generatedUUid]
    }

}

    
})
export const{
    initializeChat,
    addUserMessage,
    startStreamResponse,
    updateStreamingContent,
    finishStreamingResponse,
    addErrorMessage,
    clearChat,
    removeChat
}=chatSlice.actions
export default chatSlice.reducer