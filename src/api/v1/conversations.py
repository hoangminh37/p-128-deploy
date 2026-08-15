from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from src.core.database import get_db
from src.models.domain import Conversation, Message
from src.schemas.chat import ConversationSummary, ConversationList, ConversationMessage, ConversationDetail

from src.api.v1.auth import get_current_user
from src.schemas.patient import UserInfo

router = APIRouter(prefix="/conversations", tags=["conversations"])

@router.get("/{patient_id}", response_model=ConversationList)
async def get_conversations(patient_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation)
        .filter(Conversation.patient_id == patient_id)
        .order_by(Conversation.last_message_at.desc())
    )
    conversations = result.scalars().all()
    
    summary_list = []
    for conv in conversations:
        summary_list.append(ConversationSummary(
            conversation_id=conv.id,
            title=conv.title,
            last_message_at=conv.last_message_at.isoformat() + "Z" if conv.last_message_at else "",
            message_count=conv.message_count
        ))
        
    return ConversationList(conversations=summary_list)

@router.get("/{patient_id}/{conversation_id}", response_model=ConversationDetail)
async def get_conversation_detail(patient_id: str, conversation_id: str, db: AsyncSession = Depends(get_db), current_user: UserInfo = Depends(get_current_user)):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .filter(Conversation.patient_id == patient_id, Conversation.id == conversation_id)
    )
    conversation = result.scalars().first()
    
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy phiên hội thoại {conversation_id}"
        )
        
    messages_list = []
    for msg in conversation.messages:
        messages_list.append(ConversationMessage(
            role=msg.role,
            content=msg.content,
            created_at=msg.created_at.isoformat() + "Z" if msg.created_at else "",
            message_id=msg.id if msg.role == "assistant" else None,
            status=msg.status if msg.role == "assistant" else None,
            citations=msg.citations if msg.role == "assistant" else [],
            support_level=msg.support_level if msg.role == "assistant" else None
        ))
        
    return ConversationDetail(
        conversation_id=conversation.id,
        messages=messages_list
    )
